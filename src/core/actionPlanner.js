function extractJson(text) {
  if (!text) {
    return null;
  }

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');

  if (first === -1 || last === -1 || last <= first) {
    return null;
  }

  try {
    return JSON.parse(text.slice(first, last + 1));
  } catch {
    return null;
  }
}

function isMetaReply(reply) {
  const value = String(reply || '').trim().toLowerCase();
  if (!value) {
    return false;
  }

  return value.includes('the user is asking')
    || value.includes('direct answer')
    || value.includes('tool action')
    || value.includes('mode "answer"')
    || value.includes('mode "action"');
}

export class ActionPlanner {
  constructor(openai, aiConfig = {}) {
    this.openai = openai;
    this.model = aiConfig.model || 'qwen2.5-1.5b-instruct-q4_k_m.gguf';
  }

  async plan(text, context = {}) {
    if (!this.openai) {
      return { mode: 'answer' };
    }

    const prompt = [
      'Decide whether the user is asking for a direct answer or a concrete tool action.',
      'Return one JSON object only.',
      'Allowed mode values: answer, action.',
      'Allowed actionType values: capabilities.show, email.read, email.summarize_inbox, email.draft, email.send, sms.send, voice.call, calendar.read, calendar.create, codex.brief, task.create, memory.store.',
      'If details are missing for an action, use mode "answer" and set reply to a short clarifying question.',
      'For calendar.read, use params.scope = "today" when the user asks about today.',
      'For codex.brief, include params.repo when the repo is obvious, otherwise null.',
      `Configured adapters: ${JSON.stringify(context.adapters || [])}`,
      `Current date: ${context.currentDate || ''}`,
      `User message: ${text}`,
      'JSON schema: {"mode":"answer|action","actionType":null|string,"params":{},"reply":null|string}',
    ].join('\n\n');

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        temperature: 0,
        max_tokens: 400,
        messages: [
          { role: 'system', content: 'You are a safe assistant action planner.' },
          { role: 'user', content: prompt },
        ],
      });

      const parsed = extractJson(response.choices[0]?.message?.content || '');
      if (!parsed || !parsed.mode) {
        return { mode: 'answer' };
      }

      return {
        mode: parsed.mode === 'action' ? 'action' : 'answer',
        actionType: parsed.actionType || null,
        params: parsed.params && typeof parsed.params === 'object' ? parsed.params : {},
        reply: isMetaReply(parsed.reply) ? null : (parsed.reply || null),
      };
    } catch {
      return { mode: 'answer' };
    }
  }
}

export default ActionPlanner;
