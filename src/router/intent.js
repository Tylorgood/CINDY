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

    this.intents.set('approve_action', {
      patterns: [
        /^(?:approve|yes)\s+([a-z0-9-]+)/i
      ],
      handler: 'runtime',
      action: 'approve',
      extract: match => ({ approvalId: match[1] })
    });

    this.intents.set('deny_action', {
      patterns: [
        /^(?:deny|reject|no)\s+([a-z0-9-]+)/i
      ],
      handler: 'runtime',
      action: 'deny',
      extract: match => ({ approvalId: match[1] })
    });

    this.intents.set('capabilities', {
      patterns: [
        /^(?:capabilities|what can you do|what do you have access to)/i
      ],
      handler: 'runtime',
      action: 'capabilities'
    });

    this.intents.set('connect_google', {
      patterns: [
        /^(?:connect|link)\s+google/i
      ],
      handler: 'runtime',
      action: 'connectGoogle'
    });

    this.intents.set('show_inbox', {
      patterns: [
        /^(?:show|list|check)\s+(?:my\s+)?inbox/i,
        /^(?:inbox)$/i
      ],
      handler: 'runtime',
      action: 'inbox'
    });

    this.intents.set('summarize_inbox', {
      patterns: [
        /^(?:summarize|summary of)\s+(?:my\s+)?inbox/i,
        /^(?:what(?:'s| is)\s+my\s+inbox\s+about)/i
      ],
      handler: 'runtime',
      action: 'summarizeInbox'
    });

    this.intents.set('calendar_today', {
      patterns: [
        /^(?:calendar\s+today|what(?:'s| is)\s+on\s+my\s+calendar(?:\s+today)?)/i
      ],
      handler: 'runtime',
      action: 'calendarToday'
    });

    this.intents.set('schedule_event', {
      patterns: [
        /^(?:schedule|add calendar event)\s+(.+)/i
      ],
      handler: 'runtime',
      action: 'scheduleEvent',
      extract: match => ({ request: match[1] })
    });

    this.intents.set('text_message', {
      patterns: [
        /^(?:text|sms)\s+(.+)/i
      ],
      handler: 'runtime',
      action: 'textMessage',
      extract: match => ({ request: match[1] })
    });

    this.intents.set('call_contact', {
      patterns: [
        /^(?:call|phone)\s+(.+)/i
      ],
      handler: 'runtime',
      action: 'callContact',
      extract: match => ({ request: match[1] })
    });

    this.intents.set('draft_email', {
      patterns: [
        /^(?:draft(?:\s+an?)?\s+email(?:\s+to)?|draft a reply to)\s+(.+)/i
      ],
      handler: 'runtime',
      action: 'draftEmail',
      extract: match => ({ request: match[1] })
    });

    this.intents.set('send_email', {
      patterns: [
        /^(?:send(?:\s+an?)?\s+email(?:\s+to)?)\s+(.+)/i
      ],
      handler: 'runtime',
      action: 'sendEmail',
      extract: match => ({ request: match[1] })
    });

    this.intents.set('codex_prompt', {
      patterns: [
        /^(?:codex\s+prompt|codex\s+brief)\s*:?[\s]+(.+)/i
      ],
      handler: 'runtime',
      action: 'codexPrompt',
      extract: match => ({ request: match[1] })
    });

    this.intents.set('codex_repo_brief', {
      patterns: [
        /^(?:codex\s+brief\s+for\s+repo)\s+([^\s]+)\s+(.+)/i
      ],
      handler: 'runtime',
      action: 'codexRepoBrief',
      extract: match => ({ repo: match[1], request: match[2] })
    });

    this.intents.set('codex_refine', {
      patterns: [
        /^(?:refine\s+that\s+codex\s+prompt|refine\s+my\s+codex\s+brief)\s*:?[\s]*(.*)/i
      ],
      handler: 'runtime',
      action: 'codexRefine',
      extract: match => ({ request: match[1] })
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
"what can you do"

Ops
"connect google"
"show my inbox"
"summarize inbox"
"calendar today"
"schedule team sync tomorrow at 3pm"
"text Sarah that I'm running late"
"call Jeff"

Codex
"codex prompt: add approval buttons to Telegram"
"codex brief for repo CINDY fix the Google auth flow"
"refine that codex prompt to include tests"

Approvals
"approve <id>"
"deny <id>"`;
  }
}

export default IntentRouter;
