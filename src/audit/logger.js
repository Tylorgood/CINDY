import winston from 'winston';
import { defaults } from '../../config/defaults.js';

class AuditLogger {
  constructor(storageAdapter) {
    this.storage = storageAdapter;
    this.logger = this.createLogger();
  }

  createLogger() {
    const logFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    return winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: logFormat,
      defaultMeta: { service: 'personal-agent' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        }),
      ],
    });
  }

  async log(entry) {
    const auditEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      ...entry,
    };

    if (this.storage) {
      try {
        await this.storage.create('audit_logs', this.sanitizeEntry(auditEntry));
      } catch (error) {
        this.logger.error('Failed to store audit log:', error.message);
      }
    }

    this.logger.info(`[AUDIT] ${entry.action || 'unknown'}`, {
      userId: entry.userId,
      status: entry.status,
      trustLevel: entry.trustLevel,
    });

    return auditEntry;
  }

  async logAction(action, userId, details = {}) {
    return await this.log({
      action,
      userId,
      ...details,
      timestamp: new Date().toISOString(),
    });
  }

  async logApproval(approvalId, userId, action, decision) {
    return await this.log({
      action: `approval.${decision}`,
      userId,
      approvalId,
      targetAction: action,
      timestamp: new Date().toISOString(),
    });
  }

  async logSecurity(event, userId, details = {}) {
    return await this.log({
      action: `security.${event}`,
      userId,
      ...details,
      trustLevel: 4,
      timestamp: new Date().toISOString(),
    });
  }

  async logEmergency(event, userId, details = {}) {
    return await this.log({
      action: `emergency.${event}`,
      userId,
      ...details,
      emergency: true,
      timestamp: new Date().toISOString(),
    });
  }

  async logError(error, context = {}) {
    this.logger.error(error.message, {
      ...context,
      stack: error.stack,
    });

    return await this.log({
      action: 'error',
      ...context,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
  }

  sanitizeEntry(entry) {
    const sanitized = { ...entry };
    const sensitiveFields = defaults.audit.sensitiveFields || [];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    if (sanitized.payload) {
      sanitized.payload = this.sanitizeObject(sanitized.payload);
    }

    if (sanitized.details) {
      sanitized.details = this.sanitizeObject(sanitized.details);
    }

    return sanitized;
  }

  sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    const sensitivePatterns = ['password', 'token', 'secret', 'apiKey', 'auth', 'credential'];
    const sanitized = { ...obj };

    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();
      if (sensitivePatterns.some(p => lowerKey.includes(p))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = this.sanitizeObject(sanitized[key]);
      }
    }

    return sanitized;
  }

  generateId() {
    return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  async query(filters = {}, options = {}) {
    if (!this.storage) {
      return [];
    }

    return await this.storage.query('audit_logs', {
      ...filters,
      ...options,
    });
  }

  async getRecent(userId, limit = 50) {
    return await this.query(
      { userId },
      { limit, orderBy: { column: 'timestamp', direction: 'desc' } }
    );
  }

  async getByAction(userId, action, limit = 50) {
    return await this.query(
      { userId, action },
      { limit, orderBy: { column: 'timestamp', direction: 'desc' } }
    );
  }
}

const auditLogger = new AuditLogger();
export default auditLogger;
export { AuditLogger };