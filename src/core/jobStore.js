import { v4 as uuidv4 } from 'uuid';

function isRecoverableStorageError(error) {
  return /Could not find the table|fetch failed|network/i.test(error?.message || '');
}

export class JobStore {
  constructor(storageAdapter = null) {
    this.storage = storageAdapter;
    this.memory = {
      jobs: new Map(),
      steps: new Map(),
      artifacts: new Map(),
      sessions: new Map(),
      preferences: new Map(),
    };
  }

  async createJob(input) {
    const job = {
      id: input.id || uuidv4(),
      parentJobId: input.parentJobId || null,
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      goal: input.goal,
      phase: input.phase || 'queued',
      backend: input.backend || null,
      requestedTools: input.requestedTools || [],
      requestedBy: input.requestedBy || 'telegram',
      telegramChatId: input.telegramChatId || null,
      telegramMessageId: input.telegramMessageId || null,
      summary: input.summary || null,
      result: input.result || {},
      meta: input.meta || {},
      lastError: input.lastError || null,
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: input.startedAt || null,
      completedAt: input.completedAt || null,
    };

    return await this.persistRecord('jobs', job);
  }

  async updateJob(jobId, updates) {
    return await this.updateRecord('jobs', jobId, updates);
  }

  async getJob(jobId) {
    return await this.getRecord('jobs', jobId);
  }

  async listJobsForUser(userId, limit = 10) {
    return await this.queryRecords('jobs', {
      eq: { userId },
      orderBy: { column: 'createdAt', direction: 'desc' },
      limit,
    });
  }

  async createStep(input) {
    const step = {
      id: input.id || uuidv4(),
      jobId: input.jobId,
      stepKey: input.stepKey,
      title: input.title,
      kind: input.kind,
      phase: input.phase || 'queued',
      workerType: input.workerType || null,
      workerId: input.workerId || null,
      input: input.input || {},
      output: input.output || {},
      statusMessage: input.statusMessage || null,
      approvalId: input.approvalId || null,
      retryCount: input.retryCount || 0,
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: input.startedAt || null,
      completedAt: input.completedAt || null,
    };

    return await this.persistRecord('job_steps', step);
  }

  async updateStep(stepId, updates) {
    return await this.updateRecord('job_steps', stepId, updates);
  }

  async getStep(stepId) {
    return await this.getRecord('job_steps', stepId);
  }

  async listStepsForJob(jobId) {
    return await this.queryRecords('job_steps', {
      eq: { jobId },
      orderBy: { column: 'createdAt', direction: 'asc' },
      limit: 100,
    });
  }

  async createArtifact(input) {
    const artifact = {
      id: input.id || uuidv4(),
      jobId: input.jobId,
      stepId: input.stepId || null,
      kind: input.kind,
      label: input.label,
      content: input.content || null,
      meta: input.meta || {},
      createdAt: input.createdAt || new Date().toISOString(),
    };

    return await this.persistRecord('job_artifacts', artifact);
  }

  async listArtifactsForJob(jobId) {
    return await this.queryRecords('job_artifacts', {
      eq: { jobId },
      orderBy: { column: 'createdAt', direction: 'asc' },
      limit: 100,
    });
  }

  async upsertWorkerSession(input) {
    const existing = await this.findWorkerSession(input.workerId);
    if (existing) {
      return await this.updateRecord('worker_sessions', existing.id, {
        workerType: input.workerType || existing.workerType,
        displayName: input.displayName || existing.displayName,
        capabilities: input.capabilities || existing.capabilities || {},
        status: input.status || existing.status || 'online',
        currentJobId: input.currentJobId ?? existing.currentJobId ?? null,
        currentStepId: input.currentStepId ?? existing.currentStepId ?? null,
        lastHeartbeatAt: input.lastHeartbeatAt || new Date().toISOString(),
        meta: input.meta || existing.meta || {},
        updatedAt: new Date().toISOString(),
      });
    }

    return await this.persistRecord('worker_sessions', {
      id: input.id || uuidv4(),
      workerId: input.workerId,
      workerType: input.workerType,
      displayName: input.displayName || input.workerId,
      capabilities: input.capabilities || {},
      status: input.status || 'online',
      currentJobId: input.currentJobId || null,
      currentStepId: input.currentStepId || null,
      lastHeartbeatAt: input.lastHeartbeatAt || new Date().toISOString(),
      meta: input.meta || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async findWorkerSession(workerId) {
    const sessions = await this.queryRecords('worker_sessions', {
      eq: { workerId },
      orderBy: { column: 'updatedAt', direction: 'desc' },
      limit: 1,
    });
    return sessions[0] || null;
  }

  async listWorkerSessions() {
    return await this.queryRecords('worker_sessions', {
      orderBy: { column: 'updatedAt', direction: 'desc' },
      limit: 100,
    });
  }

  async setOperatingPreference(userId, key, value) {
    const existing = await this.findOperatingPreference(userId, key);
    if (existing) {
      return await this.updateRecord('operating_preferences', existing.id, {
        value,
        updatedAt: new Date().toISOString(),
      });
    }

    return await this.persistRecord('operating_preferences', {
      id: uuidv4(),
      userId,
      key,
      value,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async findOperatingPreference(userId, key) {
    const preferences = await this.queryRecords('operating_preferences', {
      eq: { userId, key },
      limit: 1,
    });
    return preferences[0] || null;
  }

  async persistRecord(table, record) {
    if (!this.storage) {
      this.getMemoryBucket(table).set(record.id, record);
      return { ...record };
    }

    try {
      return await this.storage.create(table, record);
    } catch (error) {
      if (isRecoverableStorageError(error)) {
        this.storage = null;
        this.getMemoryBucket(table).set(record.id, record);
        return { ...record };
      }
      throw error;
    }
  }

  async updateRecord(table, id, updates) {
    const current = await this.getRecord(table, id);
    if (!current) {
      return null;
    }

    const merged = {
      ...current,
      ...updates,
      updatedAt: updates.updatedAt || new Date().toISOString(),
    };

    if (!this.storage) {
      this.getMemoryBucket(table).set(id, merged);
      return merged;
    }

    try {
      return await this.storage.update(table, id, updates);
    } catch (error) {
      if (isRecoverableStorageError(error)) {
        this.storage = null;
        this.getMemoryBucket(table).set(id, merged);
        return merged;
      }
      throw error;
    }
  }

  async checkIdempotencyKey(key) {
    if (!key) {
      return false;
    }
    const steps = await this.queryRecords('job_steps', {
      limit: 100,
    });
    return steps.some(step => step.output?.idempotencyKey === key);
  }

  async recordIdempotencyKey(stepId, key) {
    if (!key || !stepId) {
      return null;
    }
    const step = await this.getStep(stepId);
    if (!step) {
      return null;
    }
    return await this.updateStep(stepId, {
      output: { ...(step.output || {}), idempotencyKey: key, idempotencyRecordedAt: new Date().toISOString() }
    });
  }

  async getRecord(table, id) {
    if (!this.storage) {
      return this.getMemoryBucket(table).get(id) || null;
    }

    try {
      return await this.storage.get(table, id);
    } catch (error) {
      if (isRecoverableStorageError(error)) {
        this.storage = null;
        return this.getMemoryBucket(table).get(id) || null;
      }
      throw error;
    }
  }

  async queryRecords(table, options = {}) {
    if (!this.storage) {
      const values = Array.from(this.getMemoryBucket(table).values());
      return this.applyMemoryQuery(values, options);
    }

    try {
      return await this.storage.query(table, options);
    } catch (error) {
      if (isRecoverableStorageError(error)) {
        this.storage = null;
        return this.applyMemoryQuery(Array.from(this.getMemoryBucket(table).values()), options);
      }
      throw error;
    }
  }

  applyMemoryQuery(values, options) {
    let result = [...values];
    if (options.eq) {
      result = result.filter(item => Object.entries(options.eq).every(([key, value]) => item[key] === value));
    }
    if (options.orderBy?.column) {
      const { column, direction } = options.orderBy;
      result.sort((a, b) => {
        const left = a[column] || '';
        const right = b[column] || '';
        return direction === 'desc' ? String(right).localeCompare(String(left)) : String(left).localeCompare(String(right));
      });
    }
    return typeof options.limit === 'number' ? result.slice(0, options.limit) : result;
  }

  getMemoryBucket(table) {
    switch (table) {
      case 'jobs':
        return this.memory.jobs;
      case 'job_steps':
        return this.memory.steps;
      case 'job_artifacts':
        return this.memory.artifacts;
      case 'worker_sessions':
        return this.memory.sessions;
      case 'operating_preferences':
        return this.memory.preferences;
      default:
        throw new Error(`No memory bucket configured for ${table}`);
    }
  }
}

export default JobStore;
