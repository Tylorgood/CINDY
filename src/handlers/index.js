/**
 * HANDLERS INDEX
 * Central export for all handlers
 */

import { MemoryHandler } from './memory.js';
import { TasksHandler } from './tasks.js';
import { ProjectsHandler } from './projects.js';
import { ProfileHandler } from './profile.js';
import { HelpHandler } from './help.js';
import { AIHandler } from './ai.js';

export class HandlerRegistry {
  constructor(storageAdapter, intentRouter, openai = null, aiConfig = {}) {
    this.handlers = {
      memory: new MemoryHandler(storageAdapter),
      tasks: new TasksHandler(storageAdapter),
      projects: new ProjectsHandler(storageAdapter),
      profile: new ProfileHandler(storageAdapter),
      help: new HelpHandler(intentRouter),
      ai: new AIHandler(openai, storageAdapter, aiConfig)
    };
    
    this.aiHandler = this.handlers.ai;
  }

  /**
   * Get a specific handler
   */
  get(name) {
    return this.handlers[name];
  }

  /**
   * Check if AI is available
   */
  hasAI() {
    return this.aiHandler?.isConfigured() || false;
  }

  /**
   * Execute a handler action
   */
  async execute(handlerName, action, userId, params) {
    const handler = this.handlers[handlerName];
    
    if (!handler) {
      return { success: false, message: `Handler not found: ${handlerName}` };
    }

    if (typeof handler[action] !== 'function') {
      return { success: false, message: `Action not found: ${action}` };
    }

    try {
      return await handler[action](userId, params);
    } catch (error) {
      console.error(`Handler error: ${handlerName}.${action}`, error);
      return { success: false, message: 'Something went wrong. Try again.' };
    }
  }

  /**
   * Use AI for chat (enhanced with user context)
   */
  async chatWithAI(userId, message) {
    if (!this.aiHandler?.isConfigured()) {
      return { success: false, message: "AI not configured" };
    }
    
    return await this.aiHandler.chatWithContext(userId, message);
  }
}

export default HandlerRegistry;
