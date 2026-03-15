# Qwen on Render

This is the simplest fully-Render path for a permanent CINDY brain:

1. `CINDY` stays on Render
2. `Qwen2.5` runs as a second Render service
3. the model file lives on a persistent disk so restarts do not redownload it

## What This Setup Uses

- `llama.cpp` as the model server
- official `Qwen2.5` GGUF weights from Hugging Face
- a Render web service with a persistent disk

The default setup in this repo uses:

- `Qwen/Qwen2.5-1.5B-Instruct-GGUF`
- `qwen2.5-1.5b-instruct-q4_k_m.gguf`
- Render `standard` plan

That is the cheapest Render-only starting point that still has a realistic chance
of fitting in memory. If you want better quality later, move up to:

- Render `pro`
- `Qwen/Qwen2.5-3B-Instruct-GGUF`

## Files

- `deploy/render-qwen/Dockerfile`
- `deploy/render-qwen/start-qwen.sh`
- `deploy/render-qwen/render.yaml`

## Browser-First Deployment

### 1. Push the repo changes

Render deploys from Git, so make sure this branch is pushed to GitHub before you
start in the dashboard.

### 2. Create the Qwen service in Render

1. Open Render.
2. Click `New` -> `Blueprint`.
3. Connect this repository.
4. In `Blueprint Path`, enter:

```text
deploy/render-qwen/render.yaml
```

5. Continue to the review screen.
6. When Render prompts for `LLAMA_API_KEY`, enter a long random value that you
   will reuse in CINDY.
7. Deploy the Blueprint.

The Blueprint creates one service:

- `cindy-qwen-brain`

### 3. Wait for the first startup

The first deploy is slower than normal because Render needs to:

1. build the Docker image
2. attach the persistent disk
3. download the GGUF file onto `/var/data/models`
4. load the model into memory

Open the Qwen service logs in Render and wait until you see:

- the model download finish or a message saying the cached model is being used
- `Starting llama-server on port 8000`

If the service restarts repeatedly with out-of-memory errors, change the plan
from `standard` to `pro` and redeploy.

## Point CINDY at the Qwen Service

Once the Qwen service is live, open your existing CINDY web service in Render
and add or update these environment variables:

```env
AI_PROVIDER=custom
AI_BASE_URL=https://YOUR-QWEN-SERVICE.onrender.com/v1
AI_API_KEY=THE_SAME_LLAMA_API_KEY_YOU_ENTERED_FOR_THE_QWEN_SERVICE
AI_MODEL=/var/data/models/qwen2.5-1.5b-instruct-q4_k_m.gguf
```

Use the actual public URL of the `cindy-qwen-brain` service for `AI_BASE_URL`.

If both services are in the same Render workspace and region, you can later use
the private network address instead:

```env
AI_BASE_URL=http://cindy-qwen-brain:8000/v1
```

## Redeploy and Verify

1. Save the CINDY environment changes.
2. Trigger a redeploy for CINDY.
3. Open:

```text
https://cindy-9bti.onrender.com/health
```

You want to see:

- `ai: true`
- `aiProvider: custom`
- `aiModel: /var/data/models/qwen2.5-1.5b-instruct-q4_k_m.gguf`

Then test Telegram with:

- `hey`
- `remember that I like pizza`
- `show my tasks`

## If You Want Better Quality Later

Edit the Qwen service environment in Render:

```env
MODEL_REPO=Qwen/Qwen2.5-3B-Instruct-GGUF
MODEL_FILE=qwen2.5-3b-instruct-q4_k_m.gguf
MODEL_PATH=/var/data/models/qwen2.5-3b-instruct-q4_k_m.gguf
MODEL_URL=https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf?download=true
MODEL_CONTEXT_SIZE=4096
```

Then change the Render plan to `pro` and update CINDY:

```env
AI_MODEL=/var/data/models/qwen2.5-3b-instruct-q4_k_m.gguf
```

## Troubleshooting

If the Qwen service deploys but CINDY still does not answer:

1. Check the CINDY `/health` endpoint.
2. Confirm `AI_PROVIDER=custom`.
3. Confirm `AI_BASE_URL` is the Qwen service URL plus `/v1`.
4. Confirm `AI_API_KEY` matches the Qwen service `LLAMA_API_KEY`.
5. Confirm `AI_MODEL` matches the model path exactly.

If the Qwen service fails to download from Hugging Face, add an `HF_TOKEN`
environment variable to the Qwen service in Render and redeploy.

If you use Render project environments with blocked cross-environment private
network traffic, keep using the public `onrender.com` URL instead of the private
hostname.
