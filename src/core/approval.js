import { v4 as uuidv4 } from 'uuid';
import config from '../../config/index.js';
import { defaults } from '../../config/defaults.js';
import context from './context.js';
import auditLogger from '../audit/logger.js';
import storageAdapter from '../adapters/storage/index.js';

const approvalConfig = defaults?.approval || { timeout: 30 * 60 * 1000 };

function isRecoverableStorageError(error) {
  return /Could not find the table|fetch failed|network/i.test(error?.message || '');
}

class ApprovalQueue {
  constructor() {
    this.pending = new Map();
    this.completed = new Map();
    this.storage = storageAdapter.isInitialized() ? storageAdapter : null;
  }

  hydrate(record) {
    if (!record) {
      return null;
    }

    return {
      id: record.id,
      userId: record.userId,
      action: {
        type: record.actionType,
        payload: record.payload || {},
        meta: record.meta || {},
      },
      trustLevel: record.trustLevel,
      status: record.status,
      description: record.description,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      approvedAt: record.approvedAt,
      deniedAt: record.deniedAt,
      denialReason: record.denialReason,
      completedAt: record.completedAt,
    };
  }

  async storeApprovalRecord(approval) {
    if (!this.storage) {
      return;
    }

    try {
      const record = {
        id: approval.id,
        userId: approval.userId,
        actionType: approval.action.type,
        payload: approval.action.payload || {},
        meta: approval.action.meta || {},
        trustLevel: approval.trustLevel,
        status: approval.status,
        description: approval.description,
        createdAt: approval.createdAt,
        expiresAt: approval.expiresAt,
        approvedAt: approval.approvedAt || null,
        deniedAt: approval.deniedAt || null,
        denialReason: approval.denialReason || null,
        completedAt: approval.completedAt || null,
        updatedAt: new Date().toISOString(),
      };

      const existing = await this.storage.get('approvals', approval.id);
      if (existing) {
        await this.storage.update('approvals', approval.id, record);
      } else {
        await this.storage.create('approvals', record);
      }
    } catch (error) {
      if (isRecoverableStorageError(error)) {
        this.storage = null;
        return;
      }
      throw error;
    }
  }

  async enqueue(approvalRequest) {
    const { action, trustLevel, userId, description = null } = approvalRequest;

    const approval = {
      id: uuidv4(),
      userId,
      action,
      trustLevel,
      description: description || this.getActionDescription(action),
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + approvalConfig.timeout).toISOString(),
    };

    this.pending.set(approval.id, approval);
    await this.storeApprovalRecord(approval);

    await auditLogger.log({
      action: 'approval.enqueued',
      userId,
      approvalId: approval.id,
      actionType: action.type,
      trustLevel,
      status: 'pending',
    });

    return this.formatApprovalRequest(approval);
  }

  formatApprovalRequest(approval) {
    const { action, trustLevel } = approval;
    
    return {
      id: approval.id,
      actionType: action.type,
      trustLevel,
      description: approval.description || this.getActionDescription(action),
      payload: this.summarizePayload(action.payload),
      status: approval.status,
      createdAt: approval.createdAt,
      expiresAt: approval.expiresAt,
    };
  }

  getActionDescription(action) {
    const descriptions = {
      'email.send': `Send email to ${action.payload.to}`,
      'email.draft': `Draft email to ${action.payload.to}`,
      'sms.send': `Send SMS to ${action.payload.to}`,
      'voice.call': `Call ${action.payload.to}`,
      'task.create': `Create task: ${action.payload.title}`,
      'calendar.create': `Create calendar event: ${action.payload.title}`,
    };

    return descriptions[action.type] || `Execute: ${action.type}`;
  }

  summarizePayload(payload) {
    const summary = { ...payload };
    const sensitiveFields = ['body', 'message'];
    
    for (const field of sensitiveFields) {
      if (summary[field] && summary[field].length > 100) {
        summary[field] = summary[field].substring(0, 100) + '...';
      }
    }

    return summary;
  }

  async approve(approvalId, userId) {
    const approval = await this.loadApproval(approvalId);
    
    if (!approval) {
      throw new Error(`Approval not found: ${approvalId}`);
    }

    if (approval.userId !== userId) {
      throw new Error('Unauthorized to approve this request');
    }

    approval.status = 'approved';
    approval.approvedAt = new Date().toISOString();
    this.pending.delete(approvalId);
    this.completed.set(approvalId, approval);
    await this.storeApprovalRecord(approval);

    context.removePendingApproval(approvalId);

    await auditLogger.log({
      action: 'approval.approved',
      userId,
      approvalId,
      actionType: approval.action.type,
      status: 'approved',
    });

    return approval;
  }

  async deny(approvalId, userId, reason = null) {
    const approval = await this.loadApproval(approvalId);
    
    if (!approval) {
      throw new Error(`Approval not found: ${approvalId}`);
    }

    if (approval.userId !== userId) {
      throw new Error('Unauthorized to deny this request');
    }

    approval.status = 'denied';
    approval.deniedAt = new Date().toISOString();
    approval.denialReason = reason;
    this.pending.delete(approvalId);
    this.completed.set(approvalId, approval);
    await this.storeApprovalRecord(approval);

    context.removePendingApproval(approvalId);

    await auditLogger.log({
      action: 'approval.denied',
      userId,
      approvalId,
      actionType: approval.action.type,
      status: 'denied',
      reason,
    });

    return approval;
  }

  async listPending(userId) {
    if (!this.storage) {
      return Array.from(this.pending.values())
        .filter(a => a.userId === userId)
        .map(a => this.formatApprovalRequest(a));
    }

    try {
      const records = await this.storage.query('approvals', {
        eq: { userId, status: 'pending' },
        orderBy: { column: 'createdAt', direction: 'desc' },
        limit: 50,
      });

      return records.map(record => {
        const approval = this.hydrate(record);
        this.pending.set(approval.id, approval);
        return this.formatApprovalRequest(approval);
      });
    } catch (error) {
      if (isRecoverableStorageError(error)) {
        this.storage = null;
        return Array.from(this.pending.values())
          .filter(a => a.userId === userId)
          .map(a => this.formatApprovalRequest(a));
      }
      throw error;
    }
  }

  async loadApproval(approvalId) {
    if (this.pending.has(approvalId)) {
      return this.pending.get(approvalId);
    }
    if (this.completed.has(approvalId)) {
      return this.completed.get(approvalId);
    }
    if (!this.storage) {
      return null;
    }

    let record = null;
    try {
      record = await this.storage.get('approvals', approvalId);
    } catch (error) {
      if (isRecoverableStorageError(error)) {
        this.storage = null;
        return null;
      }
      throw error;
    }
    const approval = this.hydrate(record);
    if (!approval) {
      return null;
    }

    if (approval.status === 'pending') {
      this.pending.set(approval.id, approval);
    } else {
      this.completed.set(approval.id, approval);
    }

    return approval;
  }

  async get(approvalId) {
    const approval = await this.loadApproval(approvalId);
    return approval ? this.formatApprovalRequest(approval) : null;
  }

  async checkExpired() {
    const now = new Date();
    const expired = [];

    for (const [id, approval] of this.pending) {
      if (new Date(approval.expiresAt) < now) {
        approval.status = 'expired';
        approval.expiredAt = now.toISOString();
        this.pending.delete(id);
        this.completed.set(id, approval);
        expired.push(approval);
        await this.storeApprovalRecord(approval);

        await auditLogger.log({
          action: 'approval.expired',
          userId: approval.userId,
          approvalId: id,
          actionType: approval.action.type,
          status: 'expired',
        });
      }
    }

    return expired;
  }

  getStats(userId) {
    const userCompleted = Array.from(this.completed.values())
      .filter(a => a.userId === userId);

    return {
      pending: this.pending.size,
      completed: userCompleted.length,
      approved: userCompleted.filter(a => a.status === 'approved').length,
      denied: userCompleted.filter(a => a.status === 'denied').length,
      expired: userCompleted.filter(a => a.status === 'expired').length,
    };
  }

  async countPending() {
    if (!this.storage) {
      return this.pending.size;
    }

    try {
      return await this.storage.count('approvals', { status: 'pending' });
    } catch (error) {
      if (isRecoverableStorageError(error)) {
        this.storage = null;
        return this.pending.size;
      }
      throw error;
    }
  }
}

const approvalQueue = new ApprovalQueue();
export default approvalQueue;
export { ApprovalQueue };
