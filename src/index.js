import config from '../config/index.js';
import storageAdapter from './adapters/storage/index.js';
import context from './core/context.js';
import { MemoryManager } from './core/memory.js';
import { Orchestrator } from './core/orchestrator.js';
import approvalQueue from './core/approval.js';
import auditLogger from './audit/logger.js';
import eventTrigger from './triggers/index.js';
import { validateEnvironment } from './utils/secrets.js';

class PersonalAgent {
  constructor() {
    this.initialized = false;
    this.adapters = {};
    this.orchestrator = null;
    this.memoryManager = null;
  }

  async initialize() {
    console.log('Initializing Personal Agent...');

    const envValidation = validateEnvironment();
    if (!envValidation.valid) {
      console.warn(`Missing secrets: ${envValidation.missing.join(', ')}`);
    }

    auditLogger.logger.info('Personal Agent starting');

    context.initialize('default-user');

    this.memoryManager = new MemoryManager(storageAdapter);
    
    await this.initializeAdapters();

    this.orchestrator = new Orchestrator(this.adapters);

    this.initialized = true;
    console.log('Personal Agent initialized successfully');

    await auditLogger.log({
      action: 'agent.initialized',
      status: 'success',
    });

    return this;
  }

  async initializeAdapters() {
    if (storageAdapter.isInitialized()) {
      this.adapters.storage = storageAdapter;
      auditLogger.storage = storageAdapter;
      console.log('✓ Storage adapter initialized');
    }

    if (config.google?.clientId && config.google?.clientSecret) {
      try {
        const { GmailAdapter } = await import('./adapters/gmail/index.js');
        const { CalendarAdapter } = await import('./adapters/calendar/index.js');
        
        const { GoogleAuth } = await import('google-auth-library');
        
        const auth = new GoogleAuth({
          clientId: config.google.clientId,
          clientSecret: config.google.clientSecret,
          redirectUri: config.google.redirectUri,
          scopes: config.google.scopes,
        });

        this.adapters.gmail = new GmailAdapter(auth);
        this.adapters.calendar = new CalendarAdapter(auth);
        console.log('✓ Gmail adapter initialized');
        console.log('✓ Calendar adapter initialized');
      } catch (error) {
        console.warn('⚠ Google adapters not available:', error.message);
      }
    }

    if (config.twilio?.accountSid && config.twilio?.authToken) {
      try {
        const twilio = await import('twilio');
        const twilioClient = twilio.default(
          config.twilio.accountSid,
          config.twilio.authToken
        );

        const { SmsAdapter } = await import('./adapters/sms/index.js');
        const { VoiceAdapter } = await import('./adapters/voice/index.js');

        this.adapters.sms = new SmsAdapter(twilioClient);
        this.adapters.voice = new VoiceAdapter(twilioClient);
        console.log('✓ SMS adapter initialized');
        console.log('✓ Voice adapter initialized');
      } catch (error) {
        console.warn('⚠ Twilio adapters not available:', error.message);
      }
    }

    if (config.pushover?.userKey && config.pushover?.appToken) {
      try {
        const { PushoverAdapter } = await import('./adapters/pushover/index.js');
        this.adapters.pushover = new PushoverAdapter();
        console.log('✓ Pushover adapter initialized');
      } catch (error) {
        console.warn('⚠ Pushover adapter not available:', error.message);
      }
    }

    if (config.telegram?.botToken) {
      try {
        const { TelegramAdapter } = await import('./adapters/telegram/index.js');
        this.adapters.telegram = new TelegramAdapter();
        console.log('✓ Telegram adapter initialized');
      } catch (error) {
        console.warn('⚠ Telegram adapter not available:', error.message);
      }
    }
  }

  async executeAction(action) {
    if (!this.initialized) {
      throw new Error('Agent not initialized');
    }

    return await this.orchestrator.execute(action);
  }

  async approveAction(approvalId, userId, decision, reason = null) {
    const approval = approvalQueue.get(approvalId);
    
    if (decision === 'approve') {
      const approved = await approvalQueue.approve(approvalId, userId);
      
      // Execute the approved action with skipApproval flag
      if (approved.action) {
        try {
          const actionWithSkip = { ...approved.action, skipApproval: true };
          const result = await this.orchestrator.execute(actionWithSkip);
          return { ...approved, executed: true, result };
        } catch (error) {
          return { ...approved, executed: false, error: error.message };
        }
      }
      
      return approved;
    } else {
      return await approvalQueue.deny(approvalId, userId, reason);
    }
  }

  getPendingApprovals(userId) {
    return approvalQueue.listPending(userId);
  }

  async getMemory(type, query) {
    if (!this.memoryManager) {
      throw new Error('Memory manager not initialized');
    }
    return await this.memoryManager.search(query, { type });
  }

  async storeMemory(type, data, options = {}) {
    if (!this.memoryManager) {
      throw new Error('Memory manager not initialized');
    }
    return await this.memoryManager.store(type, data, options);
  }

  getContext() {
    return context.getContext();
  }

  getCapabilities() {
    return {
      adapters: Object.keys(this.adapters),
      actions: this.orchestrator?.getCapabilities() || [],
      memory: this.memoryManager ? 'available' : 'unavailable',
    };
  }

  async shutdown() {
    console.log('Shutting down Personal Agent...');
    context.clearContext();
    this.memoryManager?.clearSessionCache();
    await auditLogger.log({ action: 'agent.shutdown', status: 'success' });
    console.log('Personal Agent stopped');
  }
}

const personalAgent = new PersonalAgent();

export default personalAgent;
export { PersonalAgent };