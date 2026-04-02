#!/bin/sh
set -eu

PORT="${PORT:-8000}"
MODEL_REPO="${MODEL_REPO:-Qwen/Qwen2.5-1.5B-Instruct-GGUF}"
MODEL_FILE="${MODEL_FILE:-qwen2.5-1.5b-instruct-q4_k_m.gguf}"
MODEL_DIR="${MODEL_DIR:-/var/data/models}"
MODEL_PATH="${MODEL_PATH:-$MODEL_DIR/$MODEL_FILE}"
MODEL_URL="${MODEL_URL:-https://huggingface.co/${MODEL_REPO}/resolve/main/${MODEL_FILE}?download=true}"
MODEL_CONTEXT_SIZE="${MODEL_CONTEXT_SIZE:-3072}"
MODEL_PARALLEL="${MODEL_PARALLEL:-1}"
LLAMA_THREADS="${LLAMA_THREADS:-1}"
LLAMA_API_KEY="${LLAMA_API_KEY:-}"
HF_TOKEN="${HF_TOKEN:-}"
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

mkdir -p "$MODEL_DIR"

if [ ! -f "$MODEL_PATH" ]; then
  TEMP_PATH="${MODEL_PATH}.partial"
  echo "Downloading model to $MODEL_PATH"
  rm -f "$TEMP_PATH"

  if [ -n "$HF_TOKEN" ]; then
    curl -L --fail \
      -H "Authorization: Bearer $HF_TOKEN" \
      -o "$TEMP_PATH" \
      "$MODEL_URL"
  else
    curl -L --fail -o "$TEMP_PATH" "$MODEL_URL"
  fi

  mv "$TEMP_PATH" "$MODEL_PATH"
else
  echo "Using cached model at $MODEL_PATH"
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

echo "Starting llama-server on port $PORT"
exec "$@"
