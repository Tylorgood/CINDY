import { v4 as uuidv4 } from 'uuid';

function isRecoverableStorageError(error) {
  return /Could not find the table|fetch failed|network/i.test(error?.message || '');
}

function sanitizeList(items, fallback) {
  if (!Array.isArray(items) || items.length === 0) {
    return fallback;
  }

  return items
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 8);
}

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

export class CodexDesk {
  constructor(openai, storageAdapter, aiConfig = {}) {
    this.openai = openai;
    this.storage = storageAdapter;
    this.model = aiConfig.model || 'qwen2.5-1.5b-instruct-q4_k_m.gguf';
  }

  async getLatestBrief(userId) {
    if (!this.storage) {
      return null;
    }

    try {
      const briefs = await this.storage.query('codex_briefs', {
        eq: { userId },
        orderBy: { column: 'createdAt', direction: 'desc' },
        limit: 1,
      });

      return briefs[0] || null;
    } catch (error) {
      if (isRecoverableStorageError(error)) {
        this.storage = null;
        return null;
      }
      throw error;
    }
  }

  async countBriefs() {
    if (!this.storage) {
      return 0;
    }

    try {
      return await this.storage.count('codex_briefs');
    } catch (error) {
      if (isRecoverableStorageError(error)) {
        this.storage = null;
        return 0;
      }
      throw error;
    }
  }

  async buildBrief(userId, sourceMessage, options = {}) {
    const previous = options.previousBrief || null;
    const repo = options.repo || null;
    const generated = await this.generateStructuredBrief(sourceMessage, repo, previous);
    const brief = {
      id: uuidv4(),
      userId,
      title: generated.title,
      goal: generated.goal,
      repo: generated.repo || repo || null,
      relevantFiles: sanitizeList(generated.relevantFiles, ['List likely files before editing.']),
      constraints: sanitizeList(generated.constraints, ['Preserve existing behavior unless the request explicitly changes it.']),
      acceptanceCriteria: sanitizeList(generated.acceptanceCriteria, ['The requested workflow works end to end.']),
      verificationSteps: sanitizeList(generated.verificationSteps, ['Run the most relevant tests or smoke checks.']),
      prompt: generated.prompt,
      sourceMessage,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (this.storage) {
      try {
        await this.storage.create('codex_briefs', brief);
      } catch (error) {
        if (isRecoverableStorageError(error)) {
          this.storage = null;
        } else {
          throw error;
        }
      }
    }

    return brief;
  }

  async generateStructuredBrief(message, repo = null, previous = null) {
    const fallback = this.buildFallbackBrief(message, repo, previous);

    if (!this.openai) {
      return fallback;
    }

    const prompt = [
      'You are building a coding brief for Codex.',
      'Return a single JSON object only.',
      'Required keys: title, goal, repo, relevantFiles, constraints, acceptanceCriteria, verificationSteps, prompt.',
      'Each list should be concise and no more than 6 items.',
      'The prompt should be copy/paste ready for Codex.',
      repo ? `Preferred repo: ${repo}` : 'Repo may be null if unknown.',
      previous ? `Previous brief:\n${previous.prompt}` : 'No previous brief.',
      `User request:\n${message}`,
    ].join('\n\n');

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        max_tokens: 900,
        messages: [
          { role: 'system', content: 'You create implementation briefs for coding agents.' },
          { role: 'user', content: prompt },
        ],
      });

      const parsed = extractJson(response.choices[0]?.message?.content || '');
      if (!parsed) {
        return fallback;
      }

      return {
        title: String(parsed.title || fallback.title).trim(),
        goal: String(parsed.goal || fallback.goal).trim(),
        repo: parsed.repo || fallback.repo,
        relevantFiles: sanitizeList(parsed.relevantFiles, fallback.relevantFiles),
        constraints: sanitizeList(parsed.constraints, fallback.constraints),
        acceptanceCriteria: sanitizeList(parsed.acceptanceCriteria, fallback.acceptanceCriteria),
        verificationSteps: sanitizeList(parsed.verificationSteps, fallback.verificationSteps),
        prompt: String(parsed.prompt || fallback.prompt).trim(),
      };
    } catch {
      return fallback;
    }
  }

  buildFallbackBrief(message, repo = null, previous = null) {
    const title = repo ? `Codex brief for ${repo}` : 'Codex implementation brief';
    const goal = previous
      ? `Refine the existing Codex brief using this instruction: ${message}`
      : message;
    const prompt = [
      `Goal: ${goal}`,
      repo ? `Repository: ${repo}` : 'Repository: determine the correct repo before editing.',
      'Deliverables:',
      '- Summarize the intent in one short paragraph.',
      '- Inspect the codebase before making assumptions.',
      '- Implement the requested change end to end.',
      '- Verify the result with the most relevant tests or smoke checks.',
      'Acceptance criteria:',
      '- The requested workflow works as described.',
      '- Existing behavior is preserved unless intentionally changed.',
      '- The final response explains what changed and how it was verified.',
      previous ? `Previous brief for context:\n${previous.prompt}` : '',
    ].filter(Boolean).join('\n');

    return {
      title,
      goal,
      repo,
      relevantFiles: ['Inspect the most relevant entrypoints and handlers first.'],
      constraints: ['Do not revert unrelated user changes.', 'Prefer minimal, targeted edits.'],
      acceptanceCriteria: ['The user request is implemented end to end.', 'The change is verified.'],
      verificationSteps: ['Run the relevant unit or integration tests.', 'Summarize the verification result.'],
      prompt,
    };
  }

  formatBriefMessage(brief) {
    const formatList = (title, items) => `${title}\n${items.map(item => `- ${item}`).join('\n')}`;

    return [
      `Codex brief: ${brief.title}`,
      `Goal: ${brief.goal}`,
      brief.repo ? `Repo: ${brief.repo}` : null,
      formatList('Relevant files', brief.relevantFiles),
      formatList('Constraints', brief.constraints),
      formatList('Acceptance criteria', brief.acceptanceCriteria),
      formatList('Verification steps', brief.verificationSteps),
      'Prompt',
      '```',
      brief.prompt,
      '```',
    ].filter(Boolean).join('\n\n');
  }
}

export default CodexDesk;
