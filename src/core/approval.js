import { v4 as uuidv4 } from 'uuid';
import config from '../../config/index.js';
import { defaults } from '../../config/defaults.js';
import context from './context.js';
import auditLogger from '../audit/logger.js';

const approvalConfig = defaults?.approval || { timeout: 30 * 60 * 1000 };

class ApprovalQueue {
  constructor() {
    this.pending = new Map();
    this.completed = new Map();
  }

  async enqueue(approvalRequest) {
    const { action, trustLevel, userId } = approvalRequest;

    const approval = {
      id: uuidv4(),
      userId,
      action,
      trustLevel,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + approvalConfig.timeout).toISOString(),
    };

    this.pending.set(approval.id, approval);

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
      description: this.getActionDescription(action),
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
    const approval = this.pending.get(approvalId);
    
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
    const approval = this.pending.get(approvalId);
    
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

  listPending(userId) {
    const userPending = Array.from(this.pending.values())
      .filter(a => a.userId === userId)
      .map(a => this.formatApprovalRequest(a));
    
    return userPending;
  }

  get(approvalId) {
    if (this.pending.has(approvalId)) {
      return this.formatApprovalRequest(this.pending.get(approvalId));
    }
    if (this.completed.has(approvalId)) {
      return this.formatApprovalRequest(this.completed.get(approvalId));
    }
    return null;
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
}

const approvalQueue = new ApprovalQueue();
export default approvalQueue;
export { ApprovalQueue };