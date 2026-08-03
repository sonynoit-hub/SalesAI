#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() {
  printf '==> %s\n' "$*"
}

if [[ -f work/auto-send-worker.pid ]]; then
  log "Stopping auto-send queue poller..."
  kill "$(cat work/auto-send-worker.pid)" >/dev/null 2>&1 || true
  rm -f work/auto-send-worker.pid
fi

if [[ -f work/ollama.pid ]]; then
  log "Stopping Ollama started by dev-up..."
  kill "$(cat work/ollama.pid)" >/dev/null 2>&1 || true
  rm -f work/ollama.pid
fi

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  log "Stopping Docker services..."
  docker compose down
else
  log "Docker is not running; skipped compose down."
fi

log "Local stack stopped. Next.js (if still running) can be stopped with Ctrl+C."
