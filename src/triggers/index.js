import { v4 as uuidv4 } from 'uuid';
import auditLogger from '../audit/logger.js';

class EventTrigger {
  constructor() {
    this.handlers = new Map();
    this.filters = new Map();
  }

  on(eventType, handler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType).push(handler);
    return () => this.off(eventType, handler);
  }

  off(eventType, handler) {
    if (this.handlers.has(eventType)) {
      const handlers = this.handlers.get(eventType);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  async emit(eventType, data = {}) {
    const event = {
      id: uuidv4(),
      type: eventType,
      data,
      timestamp: new Date().toISOString(),
    };

    if (this.filters.has(eventType)) {
      const pass = this.filters.get(eventType)(data);
      if (!pass) {
        return { filtered: true, event };
      }
    }

    const handlers = this.handlers.get(eventType) || [];
    
    const results = await Promise.allSettled(
      handlers.map(handler => handler(event))
    );

    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      await auditLogger.log({
        action: 'trigger.error',
        eventType,
        failedCount: failed.length,
        errors: failed.map(r => r.reason?.message),
      });
    }

    return {
      filtered: false,
      event,
      handled: handlers.length,
      success: failed.length === 0,
    };
  }

  filter(eventType, filterFn) {
    this.filters.set(eventType, filterFn);
  }

  clearFilters(eventType) {
    if (eventType) {
      this.filters.delete(eventType);
    } else {
      this.filters.clear();
    }
  }

  getHandlers(eventType) {
    return this.handlers.get(eventType) || [];
  }

  listEventTypes() {
    return Array.from(this.handlers.keys());
  }
}

const eventTrigger = new EventTrigger();

eventTrigger.on('email.received', async (event) => {
  console.log(`Email received: ${event.data.messageId}`);
});

eventTrigger.on('approval.approved', async (event) => {
  console.log(`Approval approved: ${event.data.approvalId}`);
});

eventTrigger.on('approval.denied', async (event) => {
  console.log(`Approval denied: ${event.data.approvalId}`);
});

eventTrigger.on('task.created', async (event) => {
  console.log(`Task created: ${event.data.taskId}`);
});

export default eventTrigger;
export { EventTrigger };