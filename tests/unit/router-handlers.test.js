import { jest } from '@jest/globals';
import { IntentRouter } from '../../src/router/intent.js';
import { TasksHandler } from '../../src/handlers/tasks.js';

describe('IntentRouter', () => {
  test('routes remember messages to the memory handler and preserves case', () => {
    const router = new IntentRouter();

    const result = router.route('remember that I like Pizza');

    expect(result.intent).toBe('remember');
    expect(result.handler).toBe('memory');
    expect(result.action).toBe('store');
    expect(result.params).toEqual({ fact: 'I like Pizza' });
  });

  test('leaves conversational messages as unknown for AI fallback', () => {
    const router = new IntentRouter();

    const result = router.route('hey');

    expect(result.intent).toBe('unknown');
    expect(result.handler).toBe('help');
    expect(result.action).toBe('suggest');
  });
});

describe('TasksHandler', () => {
  test('lists tasks in a readable plain-text format', async () => {
    const storage = {
      query: jest.fn().mockResolvedValue([
        { id: '1', title: 'Buy groceries', status: 'pending' },
        { id: '2', title: 'Write report', status: 'in_progress' },
        { id: '3', title: 'Pay rent', status: 'completed' }
      ])
    };
    const handler = new TasksHandler(storage);

    const result = await handler.list('user-123');

    expect(storage.query).toHaveBeenCalledWith('tasks', {
      eq: { userId: 'user-123' },
      orderBy: { column: 'createdAt', direction: 'desc' }
    });
    expect(result.success).toBe(true);
    expect(result.message).toContain('Pending:');
    expect(result.message).toContain('1. Buy groceries');
    expect(result.message).toContain('In progress:');
    expect(result.message).toContain('2. Write report');
    expect(result.message).toContain('Completed: 1');
  });

  test('completes tasks using the same visible numbering as the list output', async () => {
    const storage = {
      query: jest.fn().mockResolvedValue([
        { id: '1', title: 'Newest pending', status: 'pending' },
        { id: '2', title: 'Working item', status: 'in_progress' },
        { id: '3', title: 'Already done', status: 'completed' }
      ]),
      update: jest.fn().mockResolvedValue({ id: '2', status: 'completed' })
    };
    const handler = new TasksHandler(storage);

    const result = await handler.complete('user-123', { taskId: '2' });

    expect(storage.update).toHaveBeenCalledWith(
      'tasks',
      '2',
      expect.objectContaining({ status: 'completed' })
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain('Working item');
  });
});
