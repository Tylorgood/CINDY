import { jest } from '@jest/globals';
import JobStore from '../../src/core/jobStore.js';
import WorkerRegistry from '../../src/core/workerRegistry.js';
import JobSupervisor from '../../src/core/jobSupervisor.js';
import CindyRuntime from '../../src/core/runtime.js';

describe('JobSupervisor control plane', () => {
  test('creates, lists, and formats coding jobs', async () => {
    const store = new JobStore(null);
    const registry = new WorkerRegistry(store, {});
    const supervisor = new JobSupervisor({
      jobStore: store,
      workerRegistry: registry,
      telegram: null,
      config: { defaultCodingBackend: 'local-codex-bridge' },
      twentyAdapter: null,
    });

    const job = await supervisor.createCodingJob('user-123', 'fix the pricing page', {
      repo: 'CINDY',
    });

    expect(job.kind).toBe('coding_job');
    const jobs = await supervisor.listJobs('user-123');
    expect(jobs).toHaveLength(1);

    const status = await supervisor.getJobStatus('user-123', job.id);
    expect(status.job.id).toBe(job.id);
    expect(status.steps[0].kind).toBe('coding.run');
    expect(supervisor.formatJobSummary(status.job, status.steps)).toContain('coding_job');
  });

  test('claims jobs for workers and completes them from worker events', async () => {
    const store = new JobStore(null);
    const registry = new WorkerRegistry(store, {});
    const supervisor = new JobSupervisor({
      jobStore: store,
      workerRegistry: registry,
      telegram: null,
      config: { defaultCodingBackend: 'local-codex-bridge' },
      twentyAdapter: null,
    });

    const job = await supervisor.createCodingJob('user-123', 'add tests', { repo: 'CINDY' });
    const claimed = await supervisor.claimNextJob('worker-1', 'coding');

    expect(claimed.job.id).toBe(job.id);
    expect(claimed.step.phase).toBe('running');

    await supervisor.processWorkerEvent('worker-1', job.id, claimed.step.id, {
      type: 'status',
      message: 'Running tests',
    });
    await supervisor.processWorkerEvent('worker-1', job.id, claimed.step.id, {
      type: 'completed',
      message: 'All checks passed',
      output: { passed: true },
    });

    const finalJob = await store.getJob(job.id);
    expect(finalJob.phase).toBe('completed');
    const artifacts = await store.listArtifactsForJob(job.id);
    expect(artifacts).toHaveLength(0);
  });
});

describe('CindyRuntime control plane commands', () => {
  test('creates and inspects coding jobs through runtime commands', async () => {
    const runtime = new CindyRuntime({ storage: null, openai: null, aiConfig: {} });
    runtime.telegram.sendMessage = jest.fn().mockResolvedValue(null);

    const run = await runtime.runCodexJob('user-123', 'build a worker queue', 'CINDY', {
      telegramChatId: 'chat-1',
    });
    expect(run.success).toBe(true);
    expect(run.message).toContain('Queued coding job');

    const jobId = run.data.id;
    const status = await runtime.jobStatus('user-123', jobId);
    expect(status.success).toBe(true);
    expect(status.message).toContain(jobId);

    const jobs = await runtime.listJobs('user-123');
    expect(jobs.success).toBe(true);
    expect(jobs.message).toContain(jobId);
  });
});
