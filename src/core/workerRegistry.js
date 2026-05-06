export class WorkerRegistry {
  constructor(jobStore, config = {}) {
    this.jobStore = jobStore;
    this.config = config;
  }

  async registerWorker(input) {
    return await this.jobStore.upsertWorkerSession({
      workerId: input.workerId,
      workerType: input.workerType,
      displayName: input.displayName,
      capabilities: input.capabilities || {},
      status: input.status || 'online',
      meta: input.meta || {},
      lastHeartbeatAt: new Date().toISOString(),
    });
  }

  async heartbeat(workerId, patch = {}) {
    return await this.jobStore.upsertWorkerSession({
      workerId,
      workerType: patch.workerType || 'unknown',
      displayName: patch.displayName || workerId,
      capabilities: patch.capabilities || {},
      status: patch.status || 'online',
      currentJobId: patch.currentJobId || null,
      currentStepId: patch.currentStepId || null,
      meta: patch.meta || {},
      lastHeartbeatAt: new Date().toISOString(),
    });
  }

  async listWorkers() {
    return await this.jobStore.listWorkerSessions();
  }

  async getWorker(workerId) {
    return await this.jobStore.findWorkerSession(workerId);
  }

  getStaleWorkers(timeoutSeconds = 120) {
    const cutoff = Date.now() - (timeoutSeconds * 1000);
    const sessions = this.jobStore.memory.sessions;
    if (!sessions) {
      return [];
    }
    return Array.from(sessions.values()).filter(worker =>
      worker.status !== 'offline' &&
      new Date(worker.lastHeartbeatAt || 0).getTime() < cutoff
    );
  }

  async markStaleWorkersOffline(timeoutSeconds = 120) {
    const stale = this.getStaleWorkers(timeoutSeconds);
    for (const worker of stale) {
      await this.jobStore.upsertWorkerSession({
        workerId: worker.workerId,
        workerType: worker.workerType,
        displayName: worker.displayName,
        capabilities: worker.capabilities || {},
        status: 'offline',
        currentJobId: worker.currentJobId || null,
        currentStepId: worker.currentStepId || null,
        meta: { ...(worker.meta || {}), markedOfflineAt: new Date().toISOString(), reason: 'stale_heartbeat' }
      });
    }
    return stale;
  }

  async selectWorker(workerType) {
    await this.markStaleWorkersOffline();
    const workers = await this.listWorkers();
    const online = workers.filter(worker => worker.workerType === workerType && worker.status !== 'offline');
    if (online.length === 0) {
      return null;
    }

    online.sort((a, b) => {
      const aBusy = a.currentJobId ? 1 : 0;
      const bBusy = b.currentJobId ? 1 : 0;
      if (aBusy !== bBusy) {
        return aBusy - bBusy;
      }
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });

    return online[0];
  }
}

export default WorkerRegistry;
