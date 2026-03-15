/**
 * AUDIT LOGGER
 * Logs all Telegram interactions to Supabase
 */

import { v4 as uuidv4 } from 'uuid';

export class AuditLogger {
  constructor(storageAdapter) {
    this.storage = storageAdapter;
  }

  /**
   * Log an incoming Telegram message
   */
  async logIncoming(userId, messageId, text, chatId) {
    if (!this.storage) return null;

    const log = {
      id: uuidv4(),
      userId,
      action: 'telegram.incoming',
      details: {
        messageId,
        text,
        chatId,
        timestamp: new Date().toISOString()
      },
      trustLevel: 0,
      status: 'received',
      timestamp: new Date().toISOString()
    };

    try {
      await this.storage.create('audit_logs', log);
    } catch (e) {
      console.error('Failed to log incoming:', e.message);
    }

    return log;
  }

  /**
   * Log an outgoing Telegram response
   */
  async logOutgoing(userId, messageId, response, intent) {
    if (!this.storage) return;

    const log = {
      id: uuidv4(),
      userId,
      action: 'telegram.outgoing',
      details: {
        messageId,
        response,
        intent,
        timestamp: new Date().toISOString()
      },
      trustLevel: 0,
      status: 'sent',
      timestamp: new Date().toISOString()
    };

    try {
      await this.storage.create('audit_logs', log);
    } catch (e) {
      console.error('Failed to log outgoing:', e.message);
    }
  }

  /**
   * Log an action execution (task created, memory stored, etc.)
   */
  async logAction(userId, action, details, status = 'success') {
    if (!this.storage) return;

    const log = {
      id: uuidv4(),
      userId,
      action: `action.${action}`,
      details,
      trustLevel: details.trustLevel || 1,
      status,
      timestamp: new Date().toISOString()
    };

    try {
      await this.storage.create('audit_logs', log);
    } catch (e) {
      console.error('Failed to log action:', e.message);
    }
  }

  /**
   * Log an error
   */
  async logError(userId, context, error) {
    if (!this.storage) return;

    const log = {
      id: uuidv4(),
      userId,
      action: 'error',
      details: {
        context,
        error: error.message || String(error),
        timestamp: new Date().toISOString()
      },
      trustLevel: 0,
      status: 'error',
      timestamp: new Date().toISOString()
    };

    try {
      await this.storage.create('audit_logs', log);
    } catch (e) {
      console.error('Failed to log error:', e.message);
    }
  }
}

export default AuditLogger;