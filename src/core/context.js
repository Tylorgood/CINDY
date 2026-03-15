import config from '../../config/index.js';

class ContextEngine {
  constructor() {
    this.currentContext = {
      sessionId: null,
      userId: null,
      activeTask: null,
      recentActions: [],
      pendingApprovals: [],
      memory: {
        currentProject: null,
        activeProjects: [],
        recentRelationships: [],
      },
    };
    this.listeners = new Map();
  }

  initialize(userId) {
    this.currentContext.sessionId = this.generateSessionId();
    this.currentContext.userId = userId;
    this.currentContext.startedAt = new Date().toISOString();
    this.emit('context:initialized', this.currentContext);
    return this.currentContext;
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  getContext() {
    return { ...this.currentContext };
  }

  updateContext(updates) {
    const previous = { ...this.currentContext };
    this.currentContext = {
      ...this.currentContext,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.emit('context:updated', { previous, current: this.currentContext });
    return this.currentContext;
  }

  setActiveTask(task) {
    this.currentContext.activeTask = {
      ...task,
      startedAt: new Date().toISOString(),
    };
    this.emit('task:started', task);
  }

  completeActiveTask(result) {
    if (this.currentContext.activeTask) {
      const completed = {
        ...this.currentContext.activeTask,
        completedAt: new Date().toISOString(),
        result,
      };
      this.currentContext.recentActions.push(completed);
      this.currentContext.activeTask = null;
      this.emit('task:completed', completed);
    }
  }

  addRecentAction(action) {
    const actionWithMeta = {
      ...action,
      timestamp: new Date().toISOString(),
    };
    this.currentContext.recentActions.push(actionWithMeta);
    
    const maxRecent = config.defaults?.memory?.maxRecentItems || 50;
    if (this.currentContext.recentActions.length > maxRecent) {
      this.currentContext.recentActions = 
        this.currentContext.recentActions.slice(-maxRecent);
    }
  }

  addPendingApproval(approval) {
    this.currentContext.pendingApprovals.push({
      ...approval,
      addedAt: new Date().toISOString(),
    });
    this.emit('approval:added', approval);
  }

  removePendingApproval(approvalId) {
    this.currentContext.pendingApprovals = 
      this.currentContext.pendingApprovals.filter(a => a.id !== approvalId);
    this.emit('approval:removed', approvalId);
  }

  clearContext() {
    const previous = { ...this.currentContext };
    this.currentContext = {
      sessionId: null,
      userId: null,
      activeTask: null,
      recentActions: [],
      pendingApprovals: [],
      memory: {
        currentProject: null,
        activeProjects: [],
        recentRelationships: [],
      },
    };
    this.emit('context:cleared', previous);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in context listener for ${event}:`, error);
        }
      });
    }
  }
}

const contextEngine = new ContextEngine();
export default contextEngine;
export { ContextEngine };