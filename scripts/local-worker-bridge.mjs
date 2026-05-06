import { spawn } from 'child_process';
import process from 'process';
import { createHash } from 'crypto';

const coordinatorUrl = process.env.CINDY_COORDINATOR_URL;
const workerSecret = process.env.CINDY_WORKER_SECRET;
const workerId = process.env.CINDY_WORKER_ID || `local-worker-${process.pid}`;
const workerType = process.env.CINDY_WORKER_TYPE || 'coding';
const displayName = process.env.CINDY_WORKER_NAME || 'Local Codex Bridge';
const claimIntervalMs = parseInt(process.env.CINDY_WORKER_POLL_MS || '5000', 10);
const codingCommand = process.env.CINDY_CODING_COMMAND || '';
const codingArgs = process.env.CINDY_CODING_ARGS ? process.env.CINDY_CODING_ARGS.split(' ') : [];
const processedKeys = new Set();

function generateIdempotencyKey(jobId, stepId) {
  return createHash('sha256').update(`${jobId}:${stepId}:${Date.now()}`).digest('hex').slice(0, 32);
}

function isDuplicateKey(key) {
  if (!key) return false;
  if (processedKeys.has(key)) return true;
  processedKeys.add(key);
  // Keep set bounded
  if (processedKeys.size > 1000) {
    const iterator = processedKeys.values();
    for (let i = 0; i < 500; i++) {
      processedKeys.delete(iterator.next().value);
    }
  }
  return false;
}

if (!coordinatorUrl || !workerSecret) {
  console.error('Missing CINDY_COORDINATOR_URL or CINDY_WORKER_SECRET');
  process.exit(1);
}

async function api(path, options = {}) {
  const response = await fetch(`${coordinatorUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-cindy-worker-secret': workerSecret,
      'x-cindy-worker-id': workerId,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Coordinator API error (${response.status}): ${await response.text()}`);
  }

  return await response.json();
}

async function register() {
  return await api('/workers/register', {
    method: 'POST',
    body: JSON.stringify({
      workerId,
      workerType,
      displayName,
      capabilities: {
        codingCommandConfigured: !!codingCommand,
        supports: ['coding.run', 'run_tests', 'summarize_findings'],
      },
    }),
  });
}

async function heartbeat(currentJobId = null, currentStepId = null, status = 'online') {
  return await api('/workers/heartbeat', {
    method: 'POST',
    body: JSON.stringify({
      workerId,
      workerType,
      currentJobId,
      currentStepId,
      status,
    }),
  });
}

async function claimJob() {
  return await api('/workers/jobs/claim', {
    method: 'POST',
    body: JSON.stringify({
      workerId,
      workerType,
    }),
  });
}

async function postEvent(jobId, stepId, event) {
  return await api(`/workers/jobs/${jobId}/events`, {
    method: 'POST',
    body: JSON.stringify({
      workerId,
      stepId,
      event,
    }),
  });
}

function buildPrompt(job, step) {
  const repo = step?.input?.repo || job?.meta?.repo || 'unknown-repo';
  const request = step?.input?.request || job.goal;
  const acceptanceCriteria = step?.input?.acceptanceCriteria || job?.meta?.acceptanceCriteria || [];
  const backend = step?.input?.backend || job?.backend || 'codex';
  return [
    `Repository: ${repo}`,
    `Goal: ${request}`,
    `Backend: ${backend}`,
    acceptanceCriteria.length >0 ? `Acceptance criteria:\n- ${acceptanceCriteria.join('\n- ')}` : null,
    '',
    'Please return structured output as JSON with these keys:',
    '- summary: short description of what was done',
    '- changedFiles: array of file paths that were modified',
    '- testsRun: array of test commands run and their pass/fail status',
    '- artifactPaths: array of paths to generated artifacts (logs, reports, etc.)',
    '- exitReason: why the job finished (completed, failed, needs_approval, etc.)',
  ].filter(Boolean).join('\n\n');
}

async function runCodingJob(job, step) {
  const prompt = buildPrompt(job, step);
  const idempotencyKey = generateIdempotencyKey(job.id, step.id);

  // Skip if we've already processed this exact job+step combination
  if (isDuplicateKey(idempotencyKey)) {
    await postEvent(job.id, step.id, {
      type: 'status',
      message: `Skipping duplicate job ${job.id} step ${step.id}`,
    });
    return;
  }

  if (!codingCommand) {
    await postEvent(job.id, step.id, {
      type: 'failed',
      message: 'Local coding worker is online, but CINDY_CODING_COMMAND is not configured.',
      output: { prompt, idempotencyKey },
    });
    return;
  }

  await postEvent(job.id, step.id, {
    type: 'status',
    message: `Launching ${codingCommand} for ${job.id}`,
  });

  const child = spawn(codingCommand, codingArgs, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CINDY_JOB_PROMPT: prompt,
      CINDY_JOB_ID: job.id,
      CINDY_STEP_ID: step.id,
      CINDY_REPO: step?.input?.repo || job?.meta?.repo || '',
      CINDY_BACKEND: step?.input?.backend || job?.backend || 'codex',
      CINDY_IDEMPOTENCY_KEY: idempotencyKey,
    },
    shell: true,
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', chunk => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise(resolve => {
    child.on('close', resolve);
  });

  // Try to extract structured output from stdout
  let structuredOutput = null;
  try {
    const jsonMatch = stdout.match(/\{[\s\S]*"summary"[\s\S]*"changedFiles"[\s\S]*\}/);
    if (jsonMatch) {
      structuredOutput = JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Ignore parse errors, will use fallback
  }

  await postEvent(job.id, step.id, {
    type: 'artifact',
    kind: 'log',
    label: 'worker-output',
    content: stdout.slice(-12000),
    meta: { stderr: stderr.slice(-4000), exitCode, idempotencyKey },
  });

  if (exitCode === 0) {
    const output = {
      command: codingCommand,
      args: codingArgs,
      exitCode,
      idempotencyKey,
      summary: structuredOutput?.summary || `${codingCommand} finished successfully.`,
      changedFiles: structuredOutput?.changedFiles || [],
      testsRun: structuredOutput?.testsRun || [],
      artifactPaths: structuredOutput?.artifactPaths || [],
      exitReason: structuredOutput?.exitReason || 'completed',
    };

    await postEvent(job.id, step.id, {
      type: 'completed',
      message: output.summary,
      output,
    });
    return;
  }

  await postEvent(job.id, step.id, {
    type: 'failed',
    message: `${codingCommand} exited with code ${exitCode}.`,
    output: {
      command: codingCommand,
      args: codingArgs,
      exitCode,
      idempotencyKey,
      stderr: stderr.slice(-4000),
      summary: structuredOutput?.summary || `Failed with exit code ${exitCode}`,
      changedFiles: structuredOutput?.changedFiles || [],
      testsRun: structuredOutput?.testsRun || [],
    },
  });
}

async function main() {
  console.log(`Registering worker ${workerId} (${workerType}) with ${coordinatorUrl}`);
  await register();

  setInterval(() => {
    heartbeat().catch(error => {
      console.warn('Heartbeat failed:', error.message);
    });
  }, claimIntervalMs);

  while (true) {
    try {
      const claimed = await claimJob();
      if (claimed?.job && claimed?.step) {
        await heartbeat(claimed.job.id, claimed.step.id, 'busy');
        if (claimed.step.kind === 'coding.run') {
          await runCodingJob(claimed.job, claimed.step);
        } else {
          await postEvent(claimed.job.id, claimed.step.id, {
            type: 'failed',
            message: `Unsupported worker step kind: ${claimed.step.kind}`,
          });
        }
        await heartbeat(null, null, 'online');
      }
    } catch (error) {
      console.warn('Worker loop error:', error.message);
    }

    await new Promise(resolve => setTimeout(resolve, claimIntervalMs));
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
