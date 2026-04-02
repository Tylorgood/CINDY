import { jest } from '@jest/globals';
import { ActionPlanner } from '../../src/core/actionPlanner.js';
import { CodexDesk } from '../../src/core/codexDesk.js';
import CindyRuntime from '../../src/core/runtime.js';
import approvalQueue from '../../src/core/approval.js';
import { ContactStore } from '../../src/core/contacts.js';
import googleAuthClient from '../../src/adapters/gmail/client.js';

describe('ActionPlanner', () => {
  test('falls back to answer mode when no AI client is configured', async () => {
    const planner = new ActionPlanner(null, {});

    const result = await planner.plan('summarize my inbox');

    expect(result).toEqual({ mode: 'answer' });
  });

  test('parses structured action plans from the model', async () => {
    const openai = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{
              message: {
                content: '{"mode":"action","actionType":"email.summarize_inbox","params":{"maxResults":5},"reply":null}',
              },
            }],
          }),
        },
      },
    };

    const planner = new ActionPlanner(openai, { model: 'test-model' });
    const result = await planner.plan('summarize my inbox', { adapters: ['gmail'] });

    expect(result).toEqual({
      mode: 'action',
      actionType: 'email.summarize_inbox',
      params: { maxResults: 5 },
      reply: null,
    });
  });
});

describe('CodexDesk', () => {
  test('builds and stores a structured Codex brief', async () => {
    const storage = {
      create: jest.fn().mockResolvedValue({ id: 'brief-1' }),
      count: jest.fn().mockResolvedValue(1),
      query: jest.fn().mockResolvedValue([]),
    };

    const desk = new CodexDesk(null, storage, {});
    const brief = await desk.buildBrief('user-123', 'add approval buttons to Telegram', { repo: 'CINDY' });

    expect(brief.repo).toBe('CINDY');
    expect(brief.goal).toContain('add approval buttons to Telegram');
    expect(brief.acceptanceCriteria.length).toBeGreaterThan(0);
    expect(brief.verificationSteps.length).toBeGreaterThan(0);
    expect(storage.create).toHaveBeenCalledWith('codex_briefs', expect.objectContaining({
      userId: 'user-123',
      repo: 'CINDY',
    }));
    expect(desk.formatBriefMessage(brief)).toContain('Codex brief:');
  });
});

describe('CindyRuntime outbound approvals', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('requires approval for first text to an untrusted contact', async () => {
    const runtime = new CindyRuntime({ storage: null, openai: null, aiConfig: {} });
    runtime.adapters.sms = { send: jest.fn() };
    runtime.orchestrator.execute = jest.fn().mockResolvedValue({
      requiresApproval: true,
      approvalId: 'approval-1',
    });
    runtime.contacts.resolve = jest.fn().mockResolvedValue({
      id: 'contact-1',
      address: '+15551234567',
      trusted: false,
    });

    jest.spyOn(approvalQueue, 'get').mockResolvedValue({
      id: 'approval-1',
      description: 'Send SMS to +15551234567',
      trustLevel: 2,
      payload: { to: '+15551234567', message: 'Running late' },
    });

    const result = await runtime.executeOutboundAction('user-123', 'sms.send', {
      to: '+15551234567',
      message: 'Running late',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('[APPROVAL REQUEST]');
    expect(result.telegram.replyMarkup.inline_keyboard[0][0].callback_data).toBe('approve:approval-1');
    expect(runtime.orchestrator.execute).toHaveBeenCalledWith(expect.objectContaining({
      type: 'sms.send',
      requiresApproval: true,
    }));
  });

  test('auto-sends to trusted contacts after approval', async () => {
    const runtime = new CindyRuntime({ storage: null, openai: null, aiConfig: {} });
    runtime.adapters.sms = { send: jest.fn() };
    runtime.orchestrator.execute = jest.fn().mockResolvedValue({
      success: true,
      result: { sid: 'SM123' },
    });
    runtime.contacts.resolve = jest.fn().mockResolvedValue({
      id: 'contact-1',
      address: '+15551234567',
      trusted: true,
    });
    runtime.contacts.touch = jest.fn().mockResolvedValue(null);

    const result = await runtime.executeOutboundAction('user-123', 'sms.send', {
      to: '+15551234567',
      message: 'Running late',
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('Sent a text');
    expect(runtime.orchestrator.execute).toHaveBeenCalledWith(expect.objectContaining({
      type: 'sms.send',
      skipApproval: true,
    }));
    expect(runtime.contacts.touch).toHaveBeenCalledWith('contact-1');
  });

  test('starts a multi-turn email compose flow when recipient is missing', async () => {
    const runtime = new CindyRuntime({ storage: null, openai: null, aiConfig: {} });
    runtime.adapters.gmail = { sendMessage: jest.fn() };
    jest.spyOn(googleAuthClient, 'isAuthenticated').mockResolvedValue(true);
    runtime.executeAction = jest.fn().mockResolvedValue({
      success: true,
      message: 'Sent an email to tylorgood91@yahoo.com.',
    });

    const first = await runtime.executeOutboundAction('user-123', 'email.send', {});
    expect(first.success).toBe(true);
    expect(first.message).toContain('Who should I email?');

    const second = await runtime.processMessage('user-123', 'tylorgood91@yahoo.com');
    expect(second.success).toBe(true);
    expect(second.message).toContain('What should the email say?');

    const third = await runtime.processMessage('user-123', 'hey i think you are cool');
    expect(third.success).toBe(true);
    expect(third.message).toContain('Reply "send it"');

    const fourth = await runtime.processMessage('user-123', 'send it');
    expect(fourth.success).toBe(true);
    expect(runtime.executeAction).toHaveBeenCalledWith('user-123', 'email.send', {
      to: 'tylorgood91@yahoo.com',
      subject: 'Message from user-123',
      body: 'hey i think you are cool',
    }, {});
  });
});

describe('ContactStore trust persistence', () => {
  test('keeps an existing trusted contact trusted when resolving by address again', async () => {
    const storage = {
      query: jest.fn().mockResolvedValue([
        {
          id: 'contact-1',
          userId: 'user-123',
          name: 'Sarah',
          lookupKey: 'sarah',
          channel: 'sms',
          address: '+15551234567',
          trusted: true,
          trustedAt: '2026-04-01T00:00:00.000Z',
        },
      ]),
      update: jest.fn().mockResolvedValue({
        id: 'contact-1',
        trusted: true,
      }),
    };

    const contacts = new ContactStore(storage);
    await contacts.save('user-123', 'sms', {
      address: '+1 (555) 123-4567',
      trusted: false,
    });

    expect(storage.update).toHaveBeenCalledWith('contacts', 'contact-1', expect.objectContaining({
      trusted: true,
      trustedAt: '2026-04-01T00:00:00.000Z',
    }));
  });
});
