/**
 * MEMORY HANDLER
 * Stores and retrieves memories from Supabase
 */

import { v4 as uuidv4 } from 'uuid';

export class MemoryHandler {
  constructor(storageAdapter) {
    this.storage = storageAdapter;
  }

  /**
   * Store a new memory
   */
  async store(userId, params) {
    const { fact } = params;
    
    if (!fact) {
      return { success: false, message: 'What should I remember?' };
    }

    const memory = {
      id: uuidv4(),
      userId,
      type: 'fact',
      data: { fact },
      createdAt: new Date().toISOString()
    };

    await this.storage.create('memories', memory);
    
    return { 
      success: true, 
      message: `Got it! I'll remember: "${fact}"` 
    };
  }

  /**
   * Recall all memories for a user
   */
  async recall(userId) {
    const memories = await this.storage.query('memories', {
      eq: { userId },
      limit: 20,
      orderBy: { column: 'createdAt', direction: 'desc' }
    });

    if (!memories || memories.length === 0) {
      return {
        success: true,
        message: "I don't know much about you yet! Tell me something to remember.",
        data: {}
      };
    }

    // Group by type
    const facts = memories.filter(m => m.type === 'fact').map(m => m.data.fact);
    
    let message = "Here's what I know about you:\n\n";
    
    if (facts.length > 0) {
      message += "📝 Things you told me:\n";
      facts.forEach((fact, i) => {
        message += `${i + 1}. ${fact}\n`;
      });
    }
    
    if (message === "Here's what I know about you:\n\n") {
      message = "I don't have any specific facts about you yet. Tell me something to remember!";
    }

    return {
      success: true,
      message,
      data: { facts, memories }
    };
  }

  /**
   * Search memories
   */
  async search(userId, query) {
    const memories = await this.storage.query('memories', {
      eq: { userId },
      like: { data: `%${query}%` }
    });
    
    return { success: true, data: memories };
  }
}

export default MemoryHandler;