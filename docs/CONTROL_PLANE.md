# CINDY Super Control Plane

## What this adds

CINDY now has a job-oriented control plane:
- durable `jobs`, `job_steps`, `job_artifacts`, and `worker_sessions`
- a cloud coordinator in the main app
- a local worker bridge for Codex/OpenCode style execution
- Telegram commands for `jobs`, `status <job>`, `cancel job <job>`, and `run codex on <repo> to ...`

## Cloud coordinator setup

Set these env vars on Render:

```env
APP_URL=https://your-cindy-app.onrender.com
CINDY_WORKER_SECRET=choose-a-long-random-secret
TWENTY_BASE_URL=https://your-twenty-instance.example.com
TWENTY_API_KEY=...
TWENTY_WORKSPACE_ID=...
```

Apply the latest SQL from [schema.sql](/d:/Agent/personal-agent/sql/schema.sql) in Supabase so the new job tables exist.

## Local worker bridge setup

On the machine that should run Codex/OpenCode jobs:

```env
CINDY_COORDINATOR_URL=https://your-cindy-app.onrender.com
CINDY_WORKER_SECRET=the-same-secret-from-render
CINDY_WORKER_ID=local-coding-1
CINDY_WORKER_TYPE=coding
CINDY_WORKER_NAME=Local Codex Bridge
CINDY_WORKER_POLL_MS=5000
CINDY_CODING_COMMAND=codex
CINDY_CODING_ARGS=exec
```

Then start the worker:

```bash
npm run worker:local
```

If your local coding tool is `opencode` or another launcher, point `CINDY_CODING_COMMAND` and `CINDY_CODING_ARGS` at that instead.

## Worker API

The coordinator exposes these authenticated endpoints for workers:
- `POST /workers/register`
- `POST /workers/heartbeat`
- `POST /workers/jobs/claim`
- `POST /workers/jobs/:jobId/events`

Workers authenticate with the `x-cindy-worker-secret` header.

## Telegram commands

Examples:

```text
run codex on CINDY to add a worker queue
jobs
status <job-id>
cancel job <job-id>
connect twenty
update twenty deal move Acme to proposal
```

## Current behavior

- Coding jobs are queued durably and claimed by local coding workers.
- Worker progress can stream back through status and artifact events.
- Approval checkpoints are supported through `job.resume`.
- Twenty CRM support is scaffolded for note/opportunity workflows.

## Current limits

- The local worker bridge expects a working local command such as `codex exec`.
- Runbooks are planned in schema but not yet surfaced as a Telegram command.
- Twenty integration is intentionally thin in this first pass.
