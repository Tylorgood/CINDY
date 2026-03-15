# Qwen Self-Hosting

This is the recommended path if you want CINDY to use a permanent self-hosted
Qwen brain instead of paying for a hosted model API.

## Reality Check

Self-hosted does not mean zero cost unless you already own the machine.

You still pay for one of these:

- Your own always-on hardware, internet, and electricity
- A rented GPU VM or dedicated GPU server

What self-hosted does give you is:

- No per-token API bill
- Full control over the model and deployment
- One model endpoint you can reuse for multiple projects

## Recommended Architecture

Use two services:

1. CINDY app on Render
2. Qwen model on a dedicated GPU host

The model host runs:

- `vLLM` for the OpenAI-compatible API
- `Caddy` for HTTPS

CINDY then points to that host with:

```env
AI_PROVIDER=custom
AI_BASE_URL=https://brain.example.com/v1
AI_API_KEY=replace-with-the-same-vllm-api-key
AI_MODEL=Qwen/Qwen2.5-7B-Instruct
```

This works with the custom provider support already added to:

- `config/index.js`
- `server.js`

## Why vLLM

`vLLM` is a better fit than Ollama for a public permanent deployment because it:

- exposes an OpenAI-compatible API directly
- supports an API key
- is designed for model serving, not just local desktop use

Ollama is excellent for a local prototype, but `vLLM` is the cleaner permanent
backend when you want a stable public endpoint.

## Deployment Files

This repo includes a starter stack in:

- `deploy/qwen-vllm/.env.example`
- `deploy/qwen-vllm/docker-compose.yml`
- `deploy/qwen-vllm/Caddyfile`

This stack is for a full GPU VM or dedicated server where you control Docker.
If you want the lowest-manual-work hosted option, use the Runpod-specific flow
in `docs/QWEN_RUNPOD.md` instead.

## Host Requirements

Inference:

- `Qwen2.5-7B-Instruct` is the best starting point for quality vs complexity
- a GPU host is strongly recommended
- CPU-only hosting is possible, but usually too slow for a good chatbot experience

If you want a lower-risk first deployment, start smaller:

- `Qwen2.5-3B-Instruct`
- or `Qwen2.5-1.5B-Instruct`

Then move up to `7B` once the pipeline is stable.

## Bring-Up Steps

1. Provision a GPU VM or pod with Docker and Docker Compose.
2. Point a domain like `brain.example.com` to that host.
3. Copy `deploy/qwen-vllm/.env.example` to `.env` in the same folder.
4. Fill in:
   - `MODEL_ID`
   - `VLLM_API_KEY`
   - `PUBLIC_DOMAIN`
   - `ACME_EMAIL`
   - `HF_TOKEN` if the model requires it
5. Start the stack:

```bash
docker compose up -d
```

6. Verify the API:

```bash
curl https://brain.example.com/v1/models \
  -H "Authorization: Bearer YOUR_VLLM_API_KEY"
```

7. Set CINDY's Render environment variables:

```env
AI_PROVIDER=custom
AI_BASE_URL=https://brain.example.com/v1
AI_API_KEY=YOUR_VLLM_API_KEY
AI_MODEL=Qwen/Qwen2.5-7B-Instruct
```

8. Redeploy Render and check:

```text
/health
```

Expected:

- `ai: true`
- `aiProvider: custom`
- `aiModel: Qwen/Qwen2.5-7B-Instruct`

## Operational Advice

- Use a persistent disk or cached model volume so restarts do not redownload weights
- Keep `vLLM` private behind HTTPS and an API key
- Use process auto-restart and host reboot persistence
- Add monitoring before you trust it for production workflows

## Recommendation

If you want the highest chance of success:

1. Start with `Qwen/Qwen2.5-3B-Instruct`
2. Prove the deployment
3. Upgrade to `Qwen/Qwen2.5-7B-Instruct`

That path is slower than using OpenRouter today, but it is the right path if
your goal is a permanent reusable Qwen brain that you own.
