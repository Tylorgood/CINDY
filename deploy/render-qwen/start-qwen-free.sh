#!/bin/sh
set -eu

# Free-tier llama-server launcher.
# The model is already inside the image (see Dockerfile.free); nothing is
# downloaded at runtime and no persistent disk is required.

PORT="${PORT:-8000}"
MODEL_PATH="${MODEL_PATH:-/models/qwen2.5-0.5b-instruct-q4_k_m.gguf}"
MODEL_CONTEXT_SIZE="${MODEL_CONTEXT_SIZE:-2048}"
MODEL_PARALLEL="${MODEL_PARALLEL:-1}"
LLAMA_THREADS="${LLAMA_THREADS:-1}"
LLAMA_API_KEY="${LLAMA_API_KEY:-}"
LLAMA_SERVER_BIN="${LLAMA_SERVER_BIN:-}"

if [ -z "$LLAMA_SERVER_BIN" ]; then
  if [ -x /app/llama-server ]; then
    LLAMA_SERVER_BIN="/app/llama-server"
  else
    LLAMA_SERVER_BIN="$(command -v llama-server || true)"
  fi
fi

if [ -z "$LLAMA_SERVER_BIN" ]; then
  echo "llama-server binary not found"
  exit 127
fi

if [ ! -s "$MODEL_PATH" ]; then
  echo "Model not found at $MODEL_PATH"
  exit 1
fi

set -- \
  "$LLAMA_SERVER_BIN" \
  -m "$MODEL_PATH" \
  --host 0.0.0.0 \
  --port "$PORT" \
  -c "$MODEL_CONTEXT_SIZE" \
  -np "$MODEL_PARALLEL" \
  --threads "$LLAMA_THREADS"

if [ -n "$LLAMA_API_KEY" ]; then
  set -- "$@" --api-key "$LLAMA_API_KEY"
fi

echo "Starting llama-server on port $PORT with $MODEL_PATH"
exec "$@"
