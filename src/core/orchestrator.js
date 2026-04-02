import { v4 as uuidv4 } from 'uuid';
import context from './context.js';
import approval from './approval.js';
import auditLogger from '../audit/logger.js';
import { actionTypeLabels, trustLevelLabels } from '../../config/defaults.js';
import config from '../../config/index.js';

class Orchestrator {
  constructor(adapters = {}) {
    this.adapters = adapters;
    this.actionHandlers = new Map();
    this.registerDefaultHandlers();
  }

  registerDefaultHandlers() {
    this.actionHandlers.set('email.read', this.handleEmailRead.bind(this));
    this.actionHandlers.set('email.summarize', this.handleEmailSummarize.bind(this));
    this.actionHandlers.set('email.draft', this.handleEmailDraft.bind(this));
    this.actionHandlers.set('email.send', this.handleEmailSend.bind(this));
    this.actionHandlers.set('sms.send', this.handleSmsSend.bind(this));
    this.actionHandlers.set('pushover.send', this.handlePushoverSend.bind(this));
    this.actionHandlers.set('voice.call', this.handleVoiceCall.bind(this));
    this.actionHandlers.set('task.create', this.handleTaskCreate.bind(this));
    this.actionHandlers.set('calendar.read', this.handleCalendarRead.bind(this));
    this.actionHandlers.set('calendar.create', this.handleCalendarCreate.bind(this));
  }

  registerHandler(actionType, handler) {
    this.actionHandlers.set(actionType, handler);
  }

  async execute(action) {
    const { type, payload, userId, requiresApproval = false, skipApproval = false } = action;
    
    const trustLevel = actionTypeLabels[type] ?? 0;
    const needsApproval = !skipApproval && (requiresApproval || 
      config.approvalRequiredFor.includes(trustLevel));

    context.setActiveTask({
      id: uuidv4(),
      type,
      payload,
      trustLevel,
    });

    try {
      if (needsApproval) {
        const approvalRequest = await approval.enqueue({
          action,
          trustLevel,
          userId,
        });

        context.addPendingApproval(approvalRequest);

        await auditLogger.log({
          action: type,
          userId,
          trustLevel,
          status: 'pending_approval',
          approvalId: approvalRequest.id,
          payload: this.sanitizePayload(payload),
        });

        return {
          success: false,
          requiresApproval: true,
          approvalId: approvalRequest.id,
          message: 'Action requires approval',
        };
      }

      const handler = this.actionHandlers.get(type);
      if (!handler) {
        throw new Error(`No handler registered for action: ${type}`);
      }

      const result = await handler(payload, userId);

      context.completeActiveTask({ success: true, result });

      await auditLogger.log({
        action: type,
        userId,
        trustLevel,
        status: 'completed',
        result: this.sanitizePayload(result),
      });

      return { success: true, result };
    } catch (error) {
      context.completeActiveTask({ success: false, error: error.message });

      await auditLogger.log({
        action: type,
        userId,
        trustLevel,
        status: 'failed',
        error: error.message,
      });

      throw error;
    }
  }

  sanitizePayload(payload) {
    const sanitized = { ...payload };
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'authToken'];
    
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  async handleEmailRead(payload, userId) {
    const gmailAdapter = this.adapters.gmail;
    if (!gmailAdapter) {
      throw new Error('Gmail adapter not configured');
    }

    const { maxResults } = payload;
    return await gmailAdapter.listMessages(userId, { maxResults: maxResults || 20 });
  }

  async handleEmailSummarize(payload, userId) {
    const gmailAdapter = this.adapters.gmail;
    if (!gmailAdapter) {
      throw new Error('Gmail adapter not configured');
    }

    const { messageId } = payload;
    const message = await gmailAdapter.getMessage(userId, messageId);
    
    return {
      id: message.id,
      subject: message.subject,
      from: message.from,
      summary: this.summarizeEmail(message),
      date: message.date,
    };
  }

  summarizeEmail(message) {
    const preview = message.snippet || '';
    if (preview.length > 200) {
      return preview.substring(0, 200) + '...';
    }
    return preview;
  }

  async handleEmailDraft(payload, userId) {
    const gmailAdapter = this.adapters.gmail;
    if (!gmailAdapter) {
      throw new Error('Gmail adapter not configured');
    }

    const { to, subject, body } = payload;
    return await gmailAdapter.createDraft(userId, { to, subject, body });
  }

  async handleEmailSend(payload, userId) {
    const gmailAdapter = this.adapters.gmail;
    if (!gmailAdapter) {
      throw new Error('Gmail adapter not configured');
    }

    const { to, subject, body } = payload;
    return await gmailAdapter.sendMessage(userId, { to, subject, body });
  }

  async handleSmsSend(payload, userId) {
    const smsAdapter = this.adapters.sms;
    if (!smsAdapter) {
      throw new Error('SMS adapter not configured');
    }

    const { to, message } = payload;
    return await smsAdapter.send({ to, message });
  }

  async handlePushoverSend(payload, userId) {
    const pushoverAdapter = this.adapters.pushover;
    if (!pushoverAdapter) {
      throw new Error('Pushover adapter not configured');
    }

    const { message, title } = payload;
    return await pushoverAdapter.send({ message, title });
  }

  async handleVoiceCall(payload, userId) {
    const voiceAdapter = this.adapters.voice;
    if (!voiceAdapter) {
      throw new Error('Voice adapter not configured');
    }

    const { to, message } = payload;
    return await voiceAdapter.call({ to, message });
  }

  async handleTaskCreate(payload, userId) {
    const storageAdapter = this.adapters.storage;
    if (!storageAdapter) {
      throw new Error('Storage adapter not configured');
    }

    const task = {
      userId,
      ...payload,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    return await storageAdapter.create('tasks', task);
  }

  async handleCalendarRead(payload, userId) {
    const calendarAdapter = this.adapters.calendar;
    if (!calendarAdapter) {
      throw new Error('Calendar adapter not configured');
    }

    const { startDate, endDate, scope } = payload;
    if (scope === 'today') {
      return await calendarAdapter.getTodayEvents(userId);
    }

    return await calendarAdapter.listEvents(userId, {
      timeMin: startDate,
      timeMax: endDate,
    });
  }

  async handleCalendarCreate(payload, userId) {
    const calendarAdapter = this.adapters.calendar;
    if (!calendarAdapter) {
      throw new Error('Calendar adapter not configured');
    }

    return await calendarAdapter.createEvent(userId, payload);
  }

  getCapabilities() {
    return Array.from(this.actionHandlers.keys());
  }
}

export default Orchestrator;
export { Orchestrator };
