FROM ghcr.io/ggml-org/llama.cpp:server

USER root

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

COPY deploy/render-qwen/start-qwen.sh /usr/local/bin/start-qwen.sh

RUN chmod +x /usr/local/bin/start-qwen.sh

CMD ["/usr/local/bin/start-qwen.sh"]
