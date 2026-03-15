/**
 * AI HANDLER
 * Uses GPT for natural language understanding and conversation
 */

import { v4 as uuidv4 } from 'uuid';

export class AIHandler {
  constructor(openai, storageAdapter) {
    this.openai = openai;
    this.storage = storageAdapter;
    this.conversations = new Map(); // userId -> message history
    
    this.systemPrompt = `You are CINDY, a helpful personal AI assistant. Your job is to help the user manage their life.

You have access to these commands - use them when the user wants to:
- "remember [fact]" - store something they want you to remember
- "add task [text]" - create a task 
- "show my tasks" - list their tasks
- "show my projects" - list their projects
- "what do you know about me" - recall stored facts

When user asks general questions, answer helpfully from your knowledge.
When user wants to store or retrieve data, guide them to use the commands above.
Be concise, friendly, and helpful.`;

    this.maxHistory = 10; // Keep last 10 messages per user
  }

  /**
   * Check if AI is configured
   */
  isConfigured() {
    return !!this.openai;
  }

  /**
   * Get conversation history for a user
   */
  getHistory(userId) {
    return this.conversations.get(userId) || [];
  }

  /**
   * Save message to history
   */
  addToHistory(userId, role, content) {
    if (!this.conversations.has(userId)) {
      this.conversations.set(userId, []);
    }
    
    const history = this.conversations.get(userId);
    history.push({ role, content });
    
    // Trim history if too long
    if (history.length > this.maxHistory) {
      history.shift();
    }
  }

  /**
   * Process a message with AI
   */
  async chat(userId, userMessage) {
    if (!this.openai) {
      return { 
        success: false, 
        message: "AI not configured. Use commands like 'help' to see what I can do." 
      };
    }

    // Add user message to history
    this.addToHistory(userId, 'user', userMessage);

    // Build messages array
    const messages = [
      { role: 'system', content: this.systemPrompt },
      ...this.getHistory(userId).map(m => ({ role: m.role, content: m.content }))
    ];

    try {
      // Use Groq's fast models (llama is free and fast)
      const response = await this.openai.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: messages,
        temperature: 0.7,
        max_tokens: 500,
      });

      const aiMessage = response.choices[0]?.message?.content || "I'm not sure how to respond to that.";
      
      // Add AI response to history
      this.addToHistory(userId, 'assistant', aiMessage);

      return {
        success: true,
        message: aiMessage
      };
    } catch (error) {
      console.error('AI Error:', error.message);
      return {
        success: false,
        message: "Sorry, I'm having trouble thinking right now. Try a command like 'help'."
      };
    }
  }

  /**
   * Clear conversation history for a user
   */
  clearHistory(userId) {
    this.conversations.delete(userId);
    return { success: true, message: "Conversation cleared!" };
  }

  /**
   * Get user's context (profile, tasks, projects, memories) for AI context
   */
  async getUserContext(userId) {
    const context = {
      profile: null,
      tasks: [],
      projects: [],
      memories: []
    };

    try {
      // Get profile
      const profiles = await this.storage.query('profiles', { eq: { userId }, limit: 1 });
      if (profiles?.length) context.profile = profiles[0];

      // Get tasks
      const tasks = await this.storage.query('tasks', { eq: { userId } });
      context.tasks = tasks?.filter(t => t.status === 'pending') || [];

      // Get projects
      const projects = await this.storage.query('projects', { eq: { userId } });
      context.projects = projects?.filter(p => p.status === 'active') || [];

      // Get memories
      const memories = await this.storage.query('memories', { eq: { userId }, limit: 10 });
      context.memories = memories || [];
    } catch (e) {
      console.error('Error getting user context:', e.message);
    }

    return context;
  }

  /**
   * Enhanced chat with user context
   */
  async chatWithContext(userId, userMessage) {
    if (!this.openai) {
      return { 
        success: false, 
        message: "AI not configured." 
      };
    }

    // Get user context
    const context = await this.getUserContext(userId);

    // Build context string
    let contextStr = "Here's what you know about the user:\n";
    
    if (context.profile) {
      contextStr += `- Name: ${context.profile.name || 'unknown'}\n`;
      contextStr += `- Timezone: ${context.profile.timezone || 'unknown'}\n`;
    }
    
    if (context.tasks.length > 0) {
      contextStr += `- Tasks: ${context.tasks.map(t => t.title).join(', ')}\n`;
    }
    
    if (context.memories.length > 0) {
      const facts = context.memories.filter(m => m.type === 'fact').map(m => m.data.fact);
      if (facts.length > 0) {
        contextStr += `- Facts: ${facts.join('; ')}\n`;
      }
    }

    const enhancedSystem = `${this.systemPrompt}\n\n${contextStr}`;

    this.addToHistory(userId, 'user', userMessage);

    const messages = [
      { role: 'system', content: enhancedSystem },
      ...this.getHistory(userId).map(m => ({ role: m.role, content: m.content }))
    ];

    try {
      // Use Groq's fast llama model
      const response = await this.openai.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: messages,
        temperature: 0.7,
        max_tokens: 500,
      });

      const aiMessage = response.choices[0]?.message?.content || "I'm not sure how to respond.";
      
      this.addToHistory(userId, 'assistant', aiMessage);

      return {
        success: true,
        message: aiMessage
      };
    } catch (error) {
      console.error('AI Error:', error.message);
      return {
        success: false,
        message: "Sorry, I'm having trouble thinking right now."
      };
    }
  }
}

export default AIHandler;