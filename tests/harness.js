import { jest } from '@jest/globals';

export class TestHarness {
  constructor() {
    this.agent = null;
    this.testUserId = 'test-user-123';
  }

  async setup() {
    const { default: personalAgent } = await import('../src/index.js');
    this.agent = personalAgent;
    await this.agent.initialize();
    return this.agent;
  }

  async teardown() {
    if (this.agent) {
      await this.agent.shutdown();
    }
  }

  async testActionExecution() {
    const result = await this.agent.executeAction({
      type: 'email.read',
      payload: { maxResults: 5 },
      userId: this.testUserId,
    });

    return result;
  }

  async testApprovalFlow() {
    const action = {
      type: 'email.send',
      payload: {
        to: 'test@example.com',
        subject: 'Test',
        body: 'Test message',
      },
      userId: this.testUserId,
    };

    const result = await this.agent.executeAction(action);
    
    if (result.requiresApproval) {
      const approvalId = result.approvalId;
      await this.agent.approveAction(approvalId, this.testUserId, 'approve');
      return { requiredApproval: true, approvalId };
    }

    return { requiredApproval: false, result };
  }

  async testMemoryStorage() {
    await this.agent.storeMemory('test', {
      key: 'value',
      timestamp: new Date().toISOString(),
    }, { persistent: false });

    const memories = await this.agent.getMemory('test', {});
    return memories;
  }

  async testContextUpdate() {
    const context = this.agent.getContext();
    return context;
  }
}

export async function runTest(name, testFn) {
  const harness = new TestHarness();
  
  console.log(`\nRunning test: ${name}`);
  
  try {
    await harness.setup();
    const result = await testFn(harness);
    console.log(`✓ ${name} passed`);
    return { success: true, result };
  } catch (error) {
    console.error(`✗ ${name} failed:`, error.message);
    return { success: false, error: error.message };
  } finally {
    await harness.teardown();
  }
}

export const testScenarios = {
  basicExecution: async (harness) => {
    return await harness.testActionExecution();
  },
  
  approvalRequired: async (harness) => {
    return await harness.testApprovalFlow();
  },
  
  memoryOperations: async (harness) => {
    return await harness.testMemoryStorage();
  },
  
  contextRetrieval: async (harness) => {
    return await harness.testContextUpdate();
  },
};