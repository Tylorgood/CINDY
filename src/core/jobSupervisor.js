import { v4 as uuidv4 } from 'uuid';
import approvalQueue from './approval.js';

function formatTimestamp(value) {
  if (!value) {
    return 'not started';
  }
  return new Date(value).toLocaleString('en-US', { timeZone: 'America/New_York' });
}

export class JobSupervisor {
  constructor({ jobStore, workerRegistry, telegram = null, config = {}, twentyAdapter = null, leadGenerator = null }) {
    this.jobStore = jobStore;
    this.workerRegistry = workerRegistry;
    this.telegram = telegram;
    this.config = config;
    this.twenty = twentyAdapter;
    this.leadGenerator = leadGenerator;
  }

  async getHealth() {
    const workers = await this.workerRegistry.listWorkers();
    return {
      workers: workers.length,
      onlineWorkers: workers.filter(worker => worker.status !== 'offline').length,
    };
  }

  async createCodingJob(userId, request, options = {}) {
    const repo = options.repo || null;
    const backend = options.backend || this.config.defaultCodingBackend || 'local-codex-bridge';
    const title = repo ? `Coding job for ${repo}` : 'Coding job';
    const job = await this.jobStore.createJob({
      userId,
      kind: 'coding_job',
      title,
      goal: request,
      backend,
      requestedTools: ['codex', 'opencode', 'git', 'tests'],
      telegramChatId: options.telegramChatId ? String(options.telegramChatId) : null,
      telegramMessageId: options.telegramMessageId ? String(options.telegramMessageId) : null,
      meta: {
        repo,
        acceptanceCriteria: options.acceptanceCriteria || [],
        riskPolicy: 'checkpoint-approvals',
      },
    });

    await this.jobStore.createStep({
      jobId: job.id,
      stepKey: 'coding.run',
      title: repo ? `Run coding worker on ${repo}` : 'Run coding worker',
      kind: 'coding.run',
      workerType: 'coding',
      input: {
        request,
        repo,
        backend,
        acceptanceCriteria: options.acceptanceCriteria || [],
      },
    });

    await this.notifyJobUpdate(job, `Queued ${title}. I'll assign it to a coding worker when one is online.`);
    return job;
  }

  async createJob(jobInput) {
    const job = await this.jobStore.createJob(jobInput);

    if (jobInput.steps && Array.isArray(jobInput.steps)) {
      for (const step of jobInput.steps) {
        await this.jobStore.createStep({
          jobId: job.id,
          ...step,
        });
      }
    }

    await this.notifyJobUpdate(job, `Queued job: ${job.title || job.kind}.`);
    return job;
  }

  async createTwentyUpdateJob(userId, request, options = {}) {
    const job = await this.jobStore.createJob({
      userId,
      kind: 'crm_job',
      title: 'Twenty CRM update',
      goal: request,
      backend: 'cloud-twenty',
      requestedTools: ['twenty'],
      telegramChatId: options.telegramChatId ? String(options.telegramChatId) : null,
      telegramMessageId: options.telegramMessageId ? String(options.telegramMessageId) : null,
      meta: options.meta || {},
    });

    await this.jobStore.createStep({
      jobId: job.id,
      stepKey: 'crm.twenty.update',
      title: 'Update Twenty CRM',
      kind: 'crm.twenty.update',
      workerType: 'cloud',
      input: { request, meta: options.meta || {} },
    });

    await this.notifyJobUpdate(job, 'Queued a Twenty CRM update job.');
    return job;
  }

  async listJobs(userId, limit = 10) {
    return await this.jobStore.listJobsForUser(userId, limit);
  }

  async getJobStatus(userId, jobId = null) {
    if (jobId) {
      const job = await this.jobStore.getJob(jobId);
      if (!job || job.userId !== userId) {
        return null;
      }
      const steps = await this.jobStore.listStepsForJob(job.id);
      const artifacts = await this.jobStore.listArtifactsForJob(job.id);
      return { job, steps, artifacts };
    }

    const jobs = await this.listJobs(userId, 10);
    return { jobs };
  }

  async cancelJob(userId, jobId) {
    const job = await this.jobStore.getJob(jobId);
    if (!job || job.userId !== userId) {
      return null;
    }

    const updated = await this.jobStore.updateJob(jobId, {
      phase: 'cancelled',
      completedAt: new Date().toISOString(),
      summary: 'Cancelled by user',
    });
    const steps = await this.jobStore.listStepsForJob(jobId);
    await Promise.all(steps
      .filter(step => !['completed', 'failed', 'cancelled'].includes(step.phase))
      .map(step => this.jobStore.updateStep(step.id, {
        phase: 'cancelled',
        completedAt: new Date().toISOString(),
        statusMessage: 'Cancelled by user',
      })));
    await this.notifyJobUpdate(updated, `Cancelled job ${updated.id}.`);
    return updated;
  }

  async claimNextJob(workerId, workerType) {
    await this.workerRegistry.heartbeat(workerId, { workerType, status: 'online' });

    // Reset steps assigned to dead workers before looking for work
    const staleWorkers = await this.workerRegistry.getStaleWorkers(120);
    if (staleWorkers.length > 0) {
      const staleIds = new Set(staleWorkers.map(w => w.workerId));
      const allJobs = await this.jobStore.queryRecords('jobs', {
        orderBy: { column: 'createdAt', direction: 'asc' },
        limit: 100,
      });
      for (const job of allJobs) {
        const steps = await this.jobStore.listStepsForJob(job.id);
        for (const step of steps) {
          if (step.workerId && staleIds.has(step.workerId) && !['completed', 'failed', 'cancelled'].includes(step.phase)) {
            await this.jobStore.updateStep(step.id, {
              phase: 'queued',
              workerId: null,
              statusMessage: `Reset from stale worker ${step.workerId}`,
            });
          }
        }
      }
    }

    const jobs = await this.jobStore.queryRecords('jobs', {
      orderBy: { column: 'createdAt', direction: 'asc' },
      limit: 50,
    });

    for (const job of jobs) {
      if (!['queued', 'planning', 'running', 'blocked'].includes(job.phase)) {
        continue;
      }
      const steps = await this.jobStore.listStepsForJob(job.id);
      const step = steps.find(candidate =>
        candidate.workerType === workerType
        && ['queued', 'blocked'].includes(candidate.phase)
      );
      if (!step) {
        continue;
      }

      const updatedJob = await this.jobStore.updateJob(job.id, {
        phase: 'running',
        startedAt: job.startedAt || new Date().toISOString(),
      });
      const updatedStep = await this.jobStore.updateStep(step.id, {
        phase: 'running',
        workerId,
        startedAt: step.startedAt || new Date().toISOString(),
        statusMessage: `Claimed by worker ${workerId}`,
      });
      await this.workerRegistry.heartbeat(workerId, {
        workerType,
        status: 'busy',
        currentJobId: updatedJob.id,
        currentStepId: updatedStep.id,
      });
      await this.notifyJobUpdate(updatedJob, `Worker ${workerId} started ${updatedStep.title}.`);
      return {
        job: updatedJob,
        step: updatedStep,
      };
    }

    return null;
  }

  async processWorkerEvent(workerId, jobId, stepId, event) {
    const job = await this.jobStore.getJob(jobId);
    const step = await this.jobStore.getStep(stepId);
    if (!job || !step) {
      throw new Error('Job or step not found');
    }

    switch (event.type) {
      case 'status':
        await this.jobStore.updateStep(stepId, {
          statusMessage: event.message,
          output: { ...(step.output || {}), lastStatus: event.message },
        });
        await this.notifyJobUpdate(job, `Job ${job.id}: ${event.message}`);
        break;
      case 'artifact':
        await this.jobStore.createArtifact({
          jobId,
          stepId,
          kind: event.kind || 'text',
          label: event.label || 'artifact',
          content: event.content || null,
          meta: event.meta || {},
        });
        break;
      case 'approval_required': {
        const approval = await approvalQueue.enqueue({
          action: {
            type: 'job.resume',
            payload: { jobId, stepId, resumeToken: event.resumeToken || uuidv4() },
            meta: { workerId, approvalKind: event.approvalKind || 'job_checkpoint' },
          },
          userId: job.userId,
          trustLevel: 3,
          description: event.message || `Resume job ${job.id}`,
        });

        await this.jobStore.updateStep(stepId, {
          phase: 'awaiting_approval',
          approvalId: approval.id,
          statusMessage: event.message || 'Waiting for approval',
        });
        await this.jobStore.updateJob(jobId, {
          phase: 'awaiting_approval',
        });
        await this.notifyJobUpdate(job, [
          `Approval needed for job ${job.id}`,
          event.message || 'A worker requested approval.',
          `Reply "approve ${approval.id}" or "deny ${approval.id}".`,
        ].join('\n'));
        break;
      }
      case 'completed':
        await this.jobStore.updateStep(stepId, {
          phase: 'completed',
          output: event.output || step.output || {},
          statusMessage: event.message || 'Step completed',
          completedAt: new Date().toISOString(),
        });
        await this.completeJobIfReady(jobId, event.message || 'Job completed', event.output || {});
        await this.workerRegistry.heartbeat(workerId, {
          workerType: step.workerType || 'coding',
          status: 'online',
          currentJobId: null,
          currentStepId: null,
        });
        break;
      case 'failed':
        await this.jobStore.updateStep(stepId, {
          phase: 'failed',
          output: event.output || {},
          statusMessage: event.message || 'Step failed',
          completedAt: new Date().toISOString(),
        });
        await this.jobStore.updateJob(jobId, {
          phase: 'failed',
          lastError: event.message || 'Worker step failed',
          completedAt: new Date().toISOString(),
          summary: event.message || 'Job failed',
        });
        await this.workerRegistry.heartbeat(workerId, {
          workerType: step.workerType || 'coding',
          status: 'online',
          currentJobId: null,
          currentStepId: null,
        });
        await this.notifyJobUpdate(job, `Job ${job.id} failed: ${event.message || 'worker step failed'}`);
        break;
      default:
        throw new Error(`Unsupported worker event: ${event.type}`);
    }
  }

  async resumeJobFromApproval(jobId, stepId) {
    const job = await this.jobStore.getJob(jobId);
    const step = await this.jobStore.getStep(stepId);
    if (!job || !step) {
      return { success: false, message: 'Job checkpoint not found.' };
    }

    await this.jobStore.updateStep(stepId, {
      phase: 'queued',
      statusMessage: 'Approval granted, ready for worker pickup',
      approvalId: null,
    });
    await this.jobStore.updateJob(jobId, {
      phase: 'queued',
    });
    await this.notifyJobUpdate(job, `Approval granted for job ${job.id}. The worker can continue.`);
    return { success: true, message: `Resumed job ${job.id}.` };
  }

  async executeTwentyStep(jobId) {
    const job = await this.jobStore.getJob(jobId);
    if (!job) {
      return null;
    }
    const steps = await this.jobStore.listStepsForJob(jobId);
    const step = steps.find(item => item.kind === 'crm.twenty.update');
    if (!step) {
      return null;
    }

    if (!this.twenty?.isConfigured()) {
      await this.jobStore.updateStep(step.id, {
        phase: 'failed',
        statusMessage: 'Twenty is not configured',
        completedAt: new Date().toISOString(),
      });
      await this.jobStore.updateJob(jobId, {
        phase: 'failed',
        summary: 'Twenty is not configured',
        completedAt: new Date().toISOString(),
      });
      return { success: false, message: 'Twenty is not configured yet. Set TWENTY_BASE_URL and TWENTY_API_KEY first.' };
    }

    const result = await this.twenty.createNote({
      body: step.input.request,
      workspaceId: this.twenty.workspaceId,
    });

    await this.jobStore.updateStep(step.id, {
      phase: 'completed',
      output: result,
      completedAt: new Date().toISOString(),
      statusMessage: 'Twenty note created',
    });
    await this.jobStore.updateJob(jobId, {
      phase: 'completed',
      result,
      summary: 'Twenty CRM update completed',
      completedAt: new Date().toISOString(),
    });
    return { success: true, result };
  }

  async executeCrmSyncStep(jobId) {
    const job = await this.jobStore.getJob(jobId);
    if (!job) {
      return null;
    }

    const steps = await this.jobStore.listStepsForJob(jobId);
    const step = steps.find(item => item.kind === 'crm.sync' || item.kind === 'lead.sync');
    if (!step) {
      return null;
    }

    // Get the lead generator from the runtime context
    // The lead generator is passed via the supervisor's context or config
    const leadGenerator = this.leadGenerator || (this.config && this.config.leadGenerator);
    if (!leadGenerator) {
      await this.jobStore.updateStep(step.id, {
        phase: 'failed',
        statusMessage: 'Lead generator is not configured',
        completedAt: new Date().toISOString(),
      });
      await this.jobStore.updateJob(jobId, {
        phase: 'failed',
        summary: 'Lead generator not configured',
        completedAt: new Date().toISOString(),
      });
      return { success: false, message: 'Lead generator not configured. Set PROSPEO_API_KEY, WIZA_API_KEY, or GOOGLE_PLACES_API_KEY.' };
    }

    try {
      // Search for manufacturing leads
      await this.jobStore.updateStep(step.id, {
        phase: 'running',
        statusMessage: 'Searching for manufacturing leads...',
      });

      const searchResults = await leadGenerator.searchAll('manufacturing', {
        industry: 'manufacturing',
        limit: 50,
      });

      if (searchResults.total === 0) {
        await this.jobStore.updateStep(step.id, {
          phase: 'completed',
          statusMessage: 'No leads found',
          completedAt: new Date().toISOString(),
          output: { totalFound: 0, synced: 0 },
        });
        await this.jobStore.updateJob(jobId, {
          phase: 'completed',
          summary: 'No leads found to sync',
          completedAt: new Date().toISOString(),
        });
        return { success: true, message: 'No leads found to sync.' };
      }

      await this.jobStore.updateStep(step.id, {
        statusMessage: `Found ${searchResults.total} leads. Syncing to Twenty CRM...`,
      });

      // Format leads for Twenty
      const twentyLeads = leadGenerator.formatForTwenty(searchResults.leads);

      // Sync to Twenty CRM
      if (!this.twenty?.isConfigured()) {
        await this.jobStore.updateStep(step.id, {
          phase: 'failed',
          statusMessage: 'Twenty CRM is not configured',
          completedAt: new Date().toISOString(),
        });
        await this.jobStore.updateJob(jobId, {
          phase: 'failed',
          summary: 'Twenty CRM not configured',
          completedAt: new Date().toISOString(),
        });
        return { success: false, message: 'Twenty CRM is not configured. Set TWENTY_BASE_URL and TWENTY_API_KEY.' };
      }

      let syncedCount = 0;
      const errors = [];

      for (const lead of twentyLeads) {
        try {
          // Check idempotency if supported
          const idempotencyKey = `lead-sync-${lead.customFields?.externalId || lead.name}`;

          // Create company in Twenty
          const result = await this.twenty.createCompany({
            name: lead.name,
            domainName: lead.domainName || null,
            address: lead.address || null,
            employees: lead.employees || null,
            customFields: lead.customFields || {},
          }, idempotencyKey, step.id);

          if (!result.skipped) {
            syncedCount++;
          }
        } catch (error) {
          errors.push({ lead: lead.name, error: error.message });
        }
      }

      const output = {
        totalFound: searchResults.total,
        synced: syncedCount,
        errors: errors.length > 0 ? errors : undefined,
        sources: [...new Set(searchResults.leads.map(l => l.source))],
      };

      await this.jobStore.updateStep(step.id, {
        phase: 'completed',
        output,
        statusMessage: `Synced ${syncedCount} of ${searchResults.total} leads to Twenty CRM`,
        completedAt: new Date().toISOString(),
      });

      await this.jobStore.updateJob(jobId, {
        phase: 'completed',
        result: output,
        summary: `Synced ${syncedCount} leads to Twenty CRM${errors.length > 0 ? ` (${errors.length} errors)` : ''}`,
        completedAt: new Date().toISOString(),
      });

      return {
        success: true,
        result: output,
        message: `Synced ${syncedCount} leads to Twenty CRM.`,
      };
    } catch (error) {
      await this.jobStore.updateStep(step.id, {
        phase: 'failed',
        statusMessage: error.message,
        completedAt: new Date().toISOString(),
      });
      await this.jobStore.updateJob(jobId, {
        phase: 'failed',
        lastError: error.message,
        summary: 'CRM sync failed',
        completedAt: new Date().toISOString(),
      });
      return { success: false, message: `CRM sync failed: ${error.message}` };
    }
  }

  formatJobSummary(job, steps = []) {
    const stepLines = steps.map(step => `- ${step.title}: ${step.phase}${step.statusMessage ? ` (${step.statusMessage})` : ''}`);
    return [
      `Job ${job.id}`,
      `Type: ${job.kind}`,
      `Phase: ${job.phase}`,
      `Goal: ${job.goal}`,
      `Backend: ${job.backend || 'n/a'}`,
      `Created: ${formatTimestamp(job.createdAt)}`,
      stepLines.length > 0 ? `Steps\n${stepLines.join('\n')}` : null,
      job.summary ? `Summary: ${job.summary}` : null,
    ].filter(Boolean).join('\n\n');
  }

  async completeJobIfReady(jobId, summary, result = {}) {
    const job = await this.jobStore.getJob(jobId);
    const steps = await this.jobStore.listStepsForJob(jobId);
    const unfinished = steps.some(step => !['completed', 'cancelled'].includes(step.phase));
    if (unfinished) {
      return null;
    }

    const updatedJob = await this.jobStore.updateJob(jobId, {
      phase: 'completed',
      completedAt: new Date().toISOString(),
      summary,
      result,
    });
    await this.notifyJobUpdate(updatedJob, `Job ${updatedJob.id} completed.\n\n${summary}`);
    return updatedJob;
  }

  async notifyJobUpdate(job, message) {
    if (!this.telegram || !job?.telegramChatId || !message) {
      return;
    }

    try {
      await this.telegram.sendMessage(job.telegramChatId, message);
    } catch (error) {
      console.warn('Failed to send Telegram job update:', error.message);
    }
  }
}

export default JobSupervisor;
