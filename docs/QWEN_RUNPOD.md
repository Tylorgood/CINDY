# Qwen on Runpod

This is the lowest-manual-work path to a permanent public Qwen endpoint.

## Why This Path

Instead of provisioning a full GPU VM and managing Docker yourself, this path
uses a single Runpod Pod running `vllm/vllm-openai`.

That gives you:

- an always-on GPU-backed model host
- an OpenAI-compatible API for CINDY
- less setup than managing your own VM stack

## Files

- `deploy/runpod-qwen/.env.example`
- `scripts/runpod/create-qwen-pod.mjs`
- `scripts/runpod/check-qwen-pod.mjs`

## One-Time Setup

1. Create a Runpod account.
2. Create a Runpod API key.
3. Copy `deploy/runpod-qwen/.env.example` to `deploy/runpod-qwen/.env`.
4. Fill in at least:
   - `RUNPOD_API_KEY`
   - optional `RUNPOD_GPU_TYPE`
   - optional `RUNPOD_MODEL_ID`

Recommended first model:

```env
RUNPOD_MODEL_ID=Qwen/Qwen2.5-3B-Instruct
RUNPOD_SERVED_MODEL_NAME=Qwen/Qwen2.5-3B-Instruct
```

## Create the Pod

```bash
npm run runpod:create-qwen
```

The script will print:

- the Pod ID
- the public API base URL
- the generated `VLLM_API_KEY` if you did not provide one
- the exact Render env vars for CINDY

Save those values.

## Verify the Pod

Add the generated Pod ID to `deploy/runpod-qwen/.env` as:

```env
RUNPOD_POD_ID=pod-id-from-create-script
```

Then run:

```bash
npm run runpod:check-qwen
```

That checks:

- Runpod sees the pod
- the public `/v1/models` endpoint responds

## Point CINDY at the Pod

Set these in Render:

```env
AI_PROVIDER=custom
AI_BASE_URL=https://POD_ID-8000.proxy.runpod.net/v1
AI_API_KEY=THE_VLLM_API_KEY
AI_MODEL=Qwen/Qwen2.5-3B-Instruct
```

Redeploy CINDY and verify `/health`.

## Upgrade Path

Once everything is stable:

1. Stop the Pod
2. Change `RUNPOD_MODEL_ID`
3. Recreate with:
   - `Qwen/Qwen2.5-7B-Instruct`

## Note

This is not a zero-cost setup. It avoids hosted model API charges, but Runpod
still charges for the always-on GPU pod and storage.
