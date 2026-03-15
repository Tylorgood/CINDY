/**
 * INTENT ROUTER
 * Centralized intent detection for Telegram messages.
 */

export class IntentRouter {
  constructor() {
    this.intents = new Map();
    this.registerIntents();
  }

  registerIntents() {
    this.intents.set('remember', {
      patterns: [
        /^(?:remember|note|save|keep in mind|don't forget)\s+(?:that\s+)?(.+)/i,
        /^(?:remember|note|save)\s+(.+)/i
      ],
      handler: 'memory',
      action: 'store',
      extract: (match) => ({ fact: match[1] })
    });

    this.intents.set('what_do_you_know', {
      patterns: [
        /^(?:what\s+)?do you know (?:about )?(?:me)?/i,
        /^(?:what|what's).*remember/i,
        /^(?:tell me|show me).*(?:about|remember).*(?:me|my)/i
      ],
      handler: 'memory',
      action: 'recall',
      confidence: 0.9
    });

    this.intents.set('add_task', {
      patterns: [
        /^(?:add|create|new|make)\s+(?:a\s+)?task\s+(.+)/i,
        /^(?:remind me to|remind me|reminder to)\s+(.+)/i,
        /^(?:todo|to-do|to do)\s+(.+)/i
      ],
      handler: 'tasks',
      action: 'create',
      extract: (match) => ({ title: match[1] })
    });

    this.intents.set('show_tasks', {
      patterns: [
        /^(?:show|list|get|display)\s+(?:my\s+)?tasks/i,
        /^(?:my\s+)?tasks/i,
        /^(?:what(?:'s)?|what are)\s+my\s+(?:pending\s+)?tasks/i
      ],
      handler: 'tasks',
      action: 'list',
      confidence: 0.9
    });

    this.intents.set('show_projects', {
      patterns: [
        /^(?:show|list|get|display)\s+(?:my\s+)?projects/i,
        /^(?:my\s+)?projects/i,
        /^(?:what(?:'s)?|what are)\s+my\s+projects/i
      ],
      handler: 'projects',
      action: 'list',
      confidence: 0.9
    });

    this.intents.set('profile', {
      patterns: [
        /^(?:who am i|my profile|about me|what do you know about me)/i,
        /^(?:profile|settings|preferences)/i
      ],
      handler: 'profile',
      action: 'get',
      confidence: 0.9
    });

    this.intents.set('help', {
      patterns: [
        /^(?:help|commands|what can you do|how do i use)/i,
        /^(?:help|commands|list)/i
      ],
      handler: 'help',
      action: 'show',
      confidence: 0.9
    });

    this.intents.set('complete_task', {
      patterns: [
        /^(?:complete|finish|done|mark)\s+(?:task\s+)?(\d+)/i,
        /^(?:task\s+)(\d+)\s+(?:done|complete|finished)/i
      ],
      handler: 'tasks',
      action: 'complete',
      extract: (match) => ({ taskId: match[1] })
    });
  }

  /**
   * Route a message to the appropriate handler.
   * @param {string} text
   * @returns {{ intent: string, handler: string, action: string, params: object, confidence: number }}
   */
  route(text) {
    const trimmed = text.trim();

    for (const [name, intent] of this.intents) {
      for (const pattern of intent.patterns) {
        const match = trimmed.match(pattern);
        if (match) {
          const params = intent.extract ? intent.extract(match) : {};
          return {
            intent: name,
            handler: intent.handler,
            action: intent.action,
            params,
            confidence: intent.confidence || 0.8
          };
        }
      }
    }

    return {
      intent: 'unknown',
      handler: 'help',
      action: 'suggest',
      params: { originalText: text },
      confidence: 0
    };
  }

  getHelpText() {
    return `Commands I understand:

Remember
"remember that I like coffee"
"note that my birthday is March 15"

Tasks
"add task call Jeff tomorrow"
"show my tasks"
"complete task 1"

Projects
"show my projects"

About You
"what do you know about me"
"who am i"

Help
"help"
"what can you do"`;
  }
}

export default IntentRouter;
