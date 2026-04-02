import { jest } from '@jest/globals';
import { ContextEngine } from '../../src/core/context.js';
import { ApprovalQueue } from '../../src/core/approval.js';
import { MemoryManager } from '../../src/core/memory.js';

describe('ContextEngine', () => {
  let context;

  beforeEach(() => {
    context = new ContextEngine();
  });

  test('should initialize with empty context', () => {
    const result = context.getContext();
    expect(result).toBeDefined();
    expect(result.sessionId).toBeNull();
  });

  test('should initialize session with userId', () => {
    context.initialize('user-123');
    const result = context.getContext();
    
    expect(result.sessionId).toBeTruthy();
    expect(result.userId).toBe('user-123');
    expect(result.startedAt).toBeTruthy();
  });

  test('should update context with partial data', () => {
    context.initialize('user-123');
    context.updateContext({ testKey: 'testValue' });
    
    const result = context.getContext();
    expect(result.testKey).toBe('testValue');
  });

  test('should track active task', () => {
    context.initialize('user-123');
    context.setActiveTask({ id: 'task-1', title: 'Test Task' });
    
    const result = context.getContext();
    expect(result.activeTask).toBeTruthy();
    expect(result.activeTask.title).toBe('Test Task');
  });

  test('should add recent actions', () => {
    context.initialize('user-123');
    context.addRecentAction({ type: 'test', value: 'test' });
    
    const result = context.getContext();
    expect(result.recentActions.length).toBe(1);
    expect(result.recentActions[0].type).toBe('test');
  });

  test('should track pending approvals', () => {
    context.initialize('user-123');
    context.addPendingApproval({ id: 'approval-1', type: 'email.send' });
    
    const result = context.getContext();
    expect(result.pendingApprovals.length).toBe(1);
  });
});

describe('ApprovalQueue', () => {
  let approval;

  beforeEach(() => {
    approval = new ApprovalQueue();
  });

  test('should enqueue approval request', async () => {
    const result = await approval.enqueue({
      action: { type: 'email.send', payload: { to: 'test@test.com' } },
      trustLevel: 3,
      userId: 'user-123',
    });

    expect(result).toBeTruthy();
    expect(result.actionType).toBe('email.send');
    expect(result.status).toBe('pending');
  });

  test('should approve request', async () => {
    const enqueued = await approval.enqueue({
      action: { type: 'email.send', payload: { to: 'test@test.com' } },
      trustLevel: 3,
      userId: 'user-123',
    });

    const approved = await approval.approve(enqueued.id, 'user-123');
    expect(approved.status).toBe('approved');
  });

  test('should deny request', async () => {
    const enqueued = await approval.enqueue({
      action: { type: 'email.send', payload: { to: 'test@test.com' } },
      trustLevel: 3,
      userId: 'user-123',
    });

    const denied = await approval.deny(enqueued.id, 'user-123', 'Not now');
    expect(denied.status).toBe('denied');
    expect(denied.denialReason).toBe('Not now');
  });

  test('should list pending for user', async () => {
    await approval.enqueue({
      action: { type: 'email.send', payload: {} },
      trustLevel: 3,
      userId: 'user-123',
    });

    await approval.enqueue({
      action: { type: 'sms.send', payload: {} },
      trustLevel: 3,
      userId: 'user-456',
    });

    const pending = await approval.listPending('user-123');
    expect(pending.length).toBe(1);
  });
});

describe('MemoryManager', () => {
  let memory;
  let mockStorage;

  beforeEach(() => {
    mockStorage = {
      create: jest.fn().mockResolvedValue({ id: 'mem-1' }),
      get: jest.fn().mockResolvedValue({ id: 'mem-1', data: {} }),
      query: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 'mem-1' }),
      delete: jest.fn().mockResolvedValue({ deleted: true }),
    };
    memory = new MemoryManager(mockStorage);
  });

  test('should store memory', async () => {
    const result = await memory.store('test', { key: 'value' });
    expect(result).toBeTruthy();
    expect(result.type).toBe('test');
    expect(result.data.key).toBe('value');
  });

  test('should retrieve memory', async () => {
    await memory.store('test', { key: 'value' });
    const result = await memory.retrieve(expect.any(String));
    expect(result).toBeTruthy();
  });

  test('should search memories', async () => {
    await memory.search({ type: 'test' }, { limit: 10 });
    expect(mockStorage.query).toHaveBeenCalled();
  });
});
