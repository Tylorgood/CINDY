import twilio from 'twilio';
import config from '../../config/index.js';
import { IntentRouter } from '../router/intent.js';
import { HandlerRegistry } from '../handlers/index.js';
import { Orchestrator } from './orchestrator.js';
import approvalQueue from './approval.js';
import { GmailAdapter } from '../adapters/gmail/index.js';
import { CalendarAdapter } from '../adapters/calendar/index.js';
import googleAuthClient from '../adapters/gmail/client.js';
import { SmsAdapter } from '../adapters/sms/index.js';
import { VoiceAdapter } from '../adapters/voice/index.js';
import { TelegramAdapter } from '../adapters/telegram/index.js';
import { ContactStore } from './contacts.js';
import { CodexDesk } from './codexDesk.js';
import { ActionPlanner } from './actionPlanner.js';

function formatList(title, items) {
  if (!items || items.length === 0) {
    return `${title}\n- None`;
  }

  return `${title}\n${items.map(item => `- ${item}`).join('\n')}`;
}

function extractJson(text) {
  if (!text) {
    return null;
  }

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    return null;
  }

  try {
    return JSON.parse(text.slice(first, last + 1));
  } catch {
    return null;
  }
}

export class CindyRuntime {
  constructor({ storage, openai, aiConfig = {} }) {
    this.storage = storage;
    this.openai = openai;
    this.aiConfig = aiConfig;
    this.intentRouter = new IntentRouter();
    this.handlers = new HandlerRegistry(storage, this.intentRouter, openai, aiConfig);
    this.telegram = new TelegramAdapter();
    this.contacts = new ContactStore(storage);
    this.codexDesk = new CodexDesk(openai, storage, aiConfig);
    this.planner = new ActionPlanner(openai, aiConfig);
    this.adapters = this.initializeAdapters();
    this.orchestrator = new Orchestrator(this.adapters);
  }

  initializeAdapters() {
    const adapters = {};

    if (this.storage) {
      adapters.storage = this.storage;
    }

    if (googleAuthClient.isConfigured()) {
      adapters.gmail = new GmailAdapter(googleAuthClient);
      adapters.calendar = new CalendarAdapter(googleAuthClient);
    }

    if (config.twilio?.accountSid && config.twilio?.authToken) {
      const twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
      adapters.sms = new SmsAdapter(twilioClient);
      adapters.voice = new VoiceAdapter(twilioClient);
    }

    return adapters;
  }

  getAdapters() {
    return Object.keys(this.adapters);
  }

  async getHealth() {
    return {
      status: 'ok',
      ai: this.handlers.hasAI(),
      storage: !!this.storage,
      aiProvider: this.aiConfig.provider,
      aiModel: this.aiConfig.model,
      adapters: this.getAdapters(),
      approvalBacklog: await approvalQueue.countPending(),
      codexBriefs: await this.codexDesk.countBriefs(),
    };
  }

  getConnectGoogleUrl(userId) {
    if (!googleAuthClient.isConfigured()) {
      return null;
    }

    return googleAuthClient.getAuthUrl(userId);
  }

  async handleGoogleCallback(code, state) {
    const userId = state || 'default-user';
    const tokens = await googleAuthClient.exchangeCode(code, userId);
    return { userId, tokens };
  }

  async processApprovalDecision(userId, approvalId, decision) {
    if (!approvalId) {
      return { success: false, message: 'Approval ID required.' };
    }

    if (decision === 'deny') {
      await approvalQueue.deny(approvalId, userId);
      return { success: true, message: `Denied approval ${approvalId}.` };
    }

    const approved = await approvalQueue.approve(approvalId, userId);
    const action = {
      ...approved.action,
      skipApproval: true,
    };

    const execution = await this.executeAction(userId, action.type, action.payload, action.meta || {});

    if (execution.success && action.meta?.contactId && (action.type === 'email.send' || action.type === 'sms.send')) {
      await this.contacts.markTrusted(action.meta.contactId);
    }

    return execution;
  }

  async processMessage(userId, text) {
    const route = this.intentRouter.route(text);

    if (route.handler === 'runtime') {
      return await this.handleRuntimeIntent(userId, route, text);
    }

    if (route.intent !== 'unknown') {
      return await this.handlers.execute(route.handler, route.action, userId, route.params);
    }

    const plan = await this.planner.plan(text, {
      adapters: this.getAdapters(),
      currentDate: new Date().toISOString(),
    });

    if (plan.mode === 'action' && plan.actionType) {
      return await this.executeAction(userId, plan.actionType, plan.params || {}, {});
    }

    if (plan.reply) {
      return { success: true, message: plan.reply };
    }

    return await this.handlers.chatWithAI(userId, text);
  }

  async handleRuntimeIntent(userId, route, originalText) {
    switch (route.action) {
      case 'approve':
        return await this.processApprovalDecision(userId, route.params.approvalId, 'approve');
      case 'deny':
        return await this.processApprovalDecision(userId, route.params.approvalId, 'deny');
      case 'capabilities':
        return await this.showCapabilities(userId);
      case 'connectGoogle':
        return await this.connectGoogle(userId);
      case 'inbox':
        return await this.executeAction(userId, 'email.read', { maxResults: 5 }, {});
      case 'summarizeInbox':
        return await this.executeAction(userId, 'email.summarize_inbox', { maxResults: 5 }, {});
      case 'calendarToday':
        return await this.executeAction(userId, 'calendar.read', { scope: 'today' }, {});
      case 'scheduleEvent':
        return await this.planCalendarCreate(userId, route.params.request || originalText);
      case 'textMessage':
        return await this.planMessageAction(userId, 'sms.send', route.params.request || originalText);
      case 'callContact':
        return await this.planMessageAction(userId, 'voice.call', route.params.request || originalText);
      case 'draftEmail':
        return await this.planMessageAction(userId, 'email.draft', route.params.request || originalText);
      case 'sendEmail':
        return await this.planMessageAction(userId, 'email.send', route.params.request || originalText);
      case 'codexPrompt':
        return await this.createCodexBrief(userId, route.params.request || originalText, null, false);
      case 'codexRepoBrief':
        return await this.createCodexBrief(userId, route.params.request || originalText, route.params.repo, false);
      case 'codexRefine':
        return await this.createCodexBrief(userId, route.params.request || originalText, null, true);
      default:
        return { success: false, message: 'That workflow is not wired yet.' };
    }
  }

  async showCapabilities(userId) {
    const approvals = await approvalQueue.listPending(userId);
    const lines = [
      'Current live capabilities',
      formatList('Core', [
        'Conversation through the self-hosted Qwen brain',
        'Remember facts and recall them later',
        'Create, list, and complete tasks',
        'List projects and view profile context',
      ]),
      formatList('Business and ops', [
        this.adapters.gmail ? 'Read inbox and summarize inbox' : 'Google inbox not connected yet',
        this.adapters.gmail ? 'Draft and send emails with approval/trust rules' : 'Email actions unavailable until Google is connected',
        this.adapters.calendar ? 'Read calendar and create events' : 'Calendar unavailable until Google is connected',
        this.adapters.sms ? 'Send SMS with approve-once contact trust' : 'SMS unavailable until Twilio is configured',
        this.adapters.voice ? 'Place voice calls with approval' : 'Voice unavailable until Twilio is configured',
      ]),
      formatList('Codex desk', [
        'Generate Codex prompts and engineering briefs',
        'Refine the latest Codex brief',
        'Store briefs for reuse',
      ]),
      approvals.length > 0 ? `Pending approvals: ${approvals.map(item => item.id).join(', ')}` : 'Pending approvals: none',
    ];

    return { success: true, message: lines.join('\n\n') };
  }

  async connectGoogle(userId) {
    const url = this.getConnectGoogleUrl(userId);
    if (!url) {
      return {
        success: false,
        message: 'Google OAuth is not configured yet. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI first.',
      };
    }

    return {
      success: true,
      message: `Connect Google here:\n${url}`,
    };
  }

  async executeAction(userId, actionType, payload = {}, meta = {}) {
    switch (actionType) {
      case 'email.read':
        return await this.readInbox(userId, payload);
      case 'email.summarize_inbox':
        return await this.summarizeInbox(userId, payload);
      case 'email.draft':
      case 'email.send':
      case 'sms.send':
      case 'voice.call':
        return await this.executeOutboundAction(userId, actionType, payload, meta);
      case 'calendar.read':
        return await this.readCalendar(userId, payload);
      case 'calendar.create':
        return await this.createCalendarEvent(userId, payload);
      case 'codex.brief':
        return await this.createCodexBrief(userId, payload.request, payload.repo || null, false);
      case 'task.create':
        return await this.handlers.execute('tasks', 'create', userId, payload);
      case 'memory.store':
        return await this.handlers.execute('memory', 'store', userId, payload);
      case 'capabilities.show':
        return await this.showCapabilities(userId);
      default:
        return await this.handlers.chatWithAI(userId, payload.request || '');
    }
  }

  async ensureGoogleConnected(userId) {
    if (!this.adapters.gmail || !(await googleAuthClient.isAuthenticated(userId))) {
      const connect = await this.connectGoogle(userId);
      return {
        success: false,
        message: `Google is not connected yet.\n\n${connect.message}`,
      };
    }

    return null;
  }

  async readInbox(userId, payload) {
    const missing = await this.ensureGoogleConnected(userId);
    if (missing) {
      return missing;
    }

    const messages = await this.orchestrator.handleEmailRead(payload, userId);
    if (!messages || messages.length === 0) {
      return { success: true, message: 'Your inbox looks empty.' };
    }

    const detailed = [];
    for (const item of messages.slice(0, 5)) {
      const message = await this.adapters.gmail.getMessage(userId, item.id, 'full');
      detailed.push(`${message.subject || '(no subject)'} | ${message.from || 'unknown sender'} | ${message.snippet || ''}`);
    }

    return {
      success: true,
      message: `Inbox\n${detailed.map(line => `- ${line}`).join('\n')}`,
      data: messages,
    };
  }

  async summarizeInbox(userId, payload) {
    const missing = await this.ensureGoogleConnected(userId);
    if (missing) {
      return missing;
    }

    const messages = await this.orchestrator.handleEmailRead({ maxResults: payload.maxResults || 5 }, userId);
    if (!messages || messages.length === 0) {
      return { success: true, message: 'Your inbox looks empty.' };
    }

    const detailed = [];
    for (const item of messages.slice(0, 5)) {
      const message = await this.adapters.gmail.getMessage(userId, item.id, 'full');
      detailed.push({
        subject: message.subject || '(no subject)',
        from: message.from || 'unknown sender',
        snippet: message.snippet || '',
      });
    }

    if (!this.openai) {
      return {
        success: true,
        message: `Inbox summary\n${detailed.map(item => `- ${item.subject} from ${item.from}: ${item.snippet}`).join('\n')}`,
      };
    }

    const response = await this.openai.chat.completions.create({
      model: this.aiConfig.model,
      temperature: 0.2,
      max_tokens: 300,
      messages: [
        { role: 'system', content: 'Summarize inbox items into concise priorities and next steps.' },
        { role: 'user', content: JSON.stringify(detailed) },
      ],
    });

    return {
      success: true,
      message: response.choices[0]?.message?.content || 'I could not summarize the inbox just now.',
    };
  }

  async readCalendar(userId, payload) {
    const missing = await this.ensureGoogleConnected(userId);
    if (missing) {
      return missing;
    }

    const events = await this.orchestrator.handleCalendarRead(payload, userId);
    if (!events || events.length === 0) {
      return { success: true, message: 'No calendar events found for that window.' };
    }

    return {
      success: true,
      message: `Calendar\n${events.slice(0, 10).map(event => `- ${event.title || 'Untitled'} at ${event.start}`).join('\n')}`,
      data: events,
    };
  }

  async createCalendarEvent(userId, payload) {
    const missing = await this.ensureGoogleConnected(userId);
    if (missing) {
      return missing;
    }

    const result = await this.orchestrator.handleCalendarCreate(payload, userId);
    return {
      success: true,
      message: `Scheduled "${result.title}" for ${result.start}.`,
      data: result,
    };
  }

  async executeOutboundAction(userId, actionType, payload, meta = {}) {
    const channel = actionType === 'email.draft' || actionType === 'email.send'
      ? 'email'
      : actionType === 'sms.send'
        ? 'sms'
        : 'voice';

    const contact = payload.to
      ? await this.contacts.resolve(userId, channel, payload.to)
      : null;

    if ((actionType === 'email.send' || actionType === 'email.draft') && !payload.to && !contact) {
      return { success: false, message: 'I need an email recipient first.' };
    }

    if ((actionType === 'sms.send' || actionType === 'voice.call') && !payload.to && !contact) {
      return { success: false, message: 'I need a phone number or saved contact first.' };
    }

    if (!payload.to && contact) {
      payload.to = contact.address;
    }

    if ((actionType === 'email.send' || actionType === 'sms.send') && (!contact || !contact.trusted) && !meta.skipApproval) {
      const approvalResult = await this.orchestrator.execute({
        type: actionType,
        payload,
        userId,
        requiresApproval: true,
        meta: {
          ...meta,
          contactId: contact?.id || null,
        },
      });

      if (approvalResult.requiresApproval) {
        const request = await approvalQueue.get(approvalResult.approvalId);
        return {
          success: false,
          message: this.formatApprovalMessage(request),
          telegram: {
            replyMarkup: {
              inline_keyboard: [[
                { text: 'Approve', callback_data: `approve:${request.id}` },
                { text: 'Deny', callback_data: `deny:${request.id}` },
              ]],
            },
          },
        };
      }
    }

    if (actionType === 'voice.call' && !meta.skipApproval) {
      const approvalResult = await this.orchestrator.execute({
        type: actionType,
        payload,
        userId,
        requiresApproval: true,
        meta: {
          ...meta,
          contactId: contact?.id || null,
        },
      });

      const request = await approvalQueue.get(approvalResult.approvalId);
      return {
        success: false,
        message: this.formatApprovalMessage(request),
        telegram: {
          replyMarkup: {
            inline_keyboard: [[
              { text: 'Approve', callback_data: `approve:${request.id}` },
              { text: 'Deny', callback_data: `deny:${request.id}` },
            ]],
          },
        },
      };
    }

    if (actionType === 'email.draft' && !this.adapters.gmail) {
      return { success: false, message: 'Google email is not configured yet.' };
    }

    if (actionType === 'sms.send' && !this.adapters.sms) {
      return { success: false, message: 'SMS is not configured yet.' };
    }

    if (actionType === 'voice.call' && !this.adapters.voice) {
      return { success: false, message: 'Voice calling is not configured yet.' };
    }

    if (contact?.id) {
      await this.contacts.touch(contact.id);
    }

    const result = await this.orchestrator.execute({
      type: actionType,
      payload,
      userId,
      skipApproval: true,
    });

    if (actionType === 'email.draft') {
      return { success: true, message: `Drafted an email to ${payload.to}.`, data: result.result };
    }

    if (actionType === 'email.send') {
      return { success: true, message: `Sent an email to ${payload.to}.`, data: result.result };
    }

    if (actionType === 'sms.send') {
      return { success: true, message: `Sent a text to ${payload.to}.`, data: result.result };
    }

    if (actionType === 'voice.call') {
      return { success: true, message: `Started a call to ${payload.to}.`, data: result.result };
    }

    return { success: true, message: 'Action completed.', data: result.result };
  }

  formatApprovalMessage(request) {
    return [
      '[APPROVAL REQUEST]',
      `ID: ${request.id}`,
      `Action: ${request.description}`,
      `Trust level: ${request.trustLevel}`,
      `Payload: ${JSON.stringify(request.payload)}`,
      `Reply "approve ${request.id}" or "deny ${request.id}".`,
    ].join('\n');
  }

  async planMessageAction(userId, actionType, request) {
    const parsed = await this.planCommunication(actionType, request);
    if (!parsed) {
      return { success: false, message: 'I need a clearer recipient and message before I can do that.' };
    }

    return await this.executeAction(userId, actionType, parsed.payload, {});
  }

  async planCommunication(actionType, request) {
    if (!this.openai) {
      return this.fallbackCommunicationParse(actionType, request);
    }

    const schema = actionType.startsWith('email')
      ? '{"to":"","subject":"","body":"","instructions":""}'
      : '{"to":"","message":""}';

    try {
      const response = await this.openai.chat.completions.create({
        model: this.aiConfig.model,
        temperature: 0.1,
        max_tokens: 300,
        messages: [
          {
            role: 'system',
            content: `Extract the requested ${actionType} action into one JSON object only. Use this schema: ${schema}`,
          },
          { role: 'user', content: request },
        ],
      });

      const parsed = extractJson(response.choices[0]?.message?.content || '');
      if (!parsed) {
        return this.fallbackCommunicationParse(actionType, request);
      }

      if (actionType.startsWith('email')) {
        const body = parsed.body || parsed.instructions || request;
        return {
          payload: {
            to: parsed.to,
            subject: parsed.subject || 'Follow-up',
            body,
          },
        };
      }

      return {
        payload: {
          to: parsed.to,
          message: parsed.message || request,
        },
      };
    } catch {
      return this.fallbackCommunicationParse(actionType, request);
    }
  }

  fallbackCommunicationParse(actionType, request) {
    const trimmed = String(request || '').trim();
    if (!trimmed) {
      return null;
    }

    if (actionType === 'sms.send' || actionType === 'voice.call') {
      const match = trimmed.match(/^(.+?)\s+that\s+(.+)$/i);
      if (match) {
        return {
          payload: {
            to: match[1].trim(),
            message: match[2].trim(),
          },
        };
      }
    }

    if (actionType === 'email.draft' || actionType === 'email.send') {
      const match = trimmed.match(/^(.+?)\s+(?:about|re)\s+(.+)$/i);
      if (match) {
        return {
          payload: {
            to: match[1].trim(),
            subject: `About ${match[2].trim()}`,
            body: `Hi ${match[1].trim()},\n\n${match[2].trim()}\n`,
          },
        };
      }
    }

    return null;
  }

  async planCalendarCreate(userId, request) {
    if (!request) {
      return { success: false, message: 'Tell me what to schedule and when.' };
    }

    if (!this.openai) {
      return { success: false, message: 'Calendar scheduling needs AI planning right now. Try a clearer request with a date and time.' };
    }

    const response = await this.openai.chat.completions.create({
      model: this.aiConfig.model,
      temperature: 0.1,
      max_tokens: 350,
      messages: [
        {
          role: 'system',
          content: 'Extract calendar event details into one JSON object only with keys title, description, start, end, location. Use ISO 8601 strings for start and end when possible.',
        },
        {
          role: 'user',
          content: `Current date: ${new Date().toISOString()}\nTimezone: ${config.user.timezone}\nRequest: ${request}`,
        },
      ],
    });

    const parsed = extractJson(response.choices[0]?.message?.content || '');
    if (!parsed?.title || !parsed?.start || !parsed?.end) {
      return { success: false, message: 'I could not turn that into a calendar event. Try including a specific date and time.' };
    }

    return await this.executeAction(userId, 'calendar.create', parsed, {});
  }

  async createCodexBrief(userId, request, repo = null, refine = false) {
    const previous = refine ? await this.codexDesk.getLatestBrief(userId) : null;
    const brief = await this.codexDesk.buildBrief(userId, request, {
      repo,
      previousBrief: previous,
    });

    return {
      success: true,
      message: this.codexDesk.formatBriefMessage(brief),
      data: brief,
    };
  }
}

export default CindyRuntime;
