#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WITH_QUEUE=0
SKIP_MIGRATE=0
SKIP_SEED=0
FOREGROUND_APP=1

usage() {
  cat <<'EOF'
Usage: scripts/dev-up.sh [options]

Starts the local SalesAI stack:
  - Docker services (Postgres, SearXNG, Crawl4AI)
  - Ollama
  - Prisma migrations
  - Database seed
  - Next.js dev server

Options:
  --with-queue    Also poll the auto-send queue every 60s
  --skip-migrate  Skip database migrations
  --skip-seed     Skip database seed
  --containers    Only start containers + Ollama (no Next.js)
  -h, --help      Show this help
EOF
}

for arg in "$@"; do
  case "$arg" in
    --with-queue) WITH_QUEUE=1 ;;
    --skip-migrate) SKIP_MIGRATE=1 ;;
    --skip-seed) SKIP_SEED=1 ;;
    --containers) FOREGROUND_APP=0 ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

log() {
  printf '==> %s\n' "$*"
}

warn() {
  printf '!!  %s\n' "$*" >&2
}

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      local key="${BASH_REMATCH[1]}"
      local value="${BASH_REMATCH[2]}"
      if [[ "$value" =~ ^\".*\"$ || "$value" =~ ^\'.*\'$ ]]; then
        value="${value:1:${#value}-2}"
      fi
      export "$key=$value"
    fi
  done < "$file"
}

ensure_env() {
  if [[ ! -f .env.local ]]; then
    if [[ -f .env.example ]]; then
      cp .env.example .env.local
      warn "Created .env.local from .env.example — fill in OAuth secrets as needed."
    else
      warn "No .env.local found. Create one before using Gmail/Outlook."
    fi
  fi

  # Prefer .env.local over .env over .env.example for local boots.
  load_env_file .env.example
  load_env_file .env
  load_env_file .env.local
}

parse_database_port() {
  local url="${DATABASE_URL:-postgresql://salesai:salesai@localhost:5432/salesai}"
  if [[ "$url" =~ @[^/:]+:([0-9]+)/ ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
  else
    printf '5432\n'
  fi
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is required but was not found in PATH." >&2
    exit 1
  fi

  if docker info >/dev/null 2>&1; then
    return 0
  fi

  if [[ "$(uname -s)" == "Darwin" ]]; then
    log "Starting Docker Desktop..."
    open -a Docker >/dev/null 2>&1 || true
    for _ in $(seq 1 60); do
      if docker info >/dev/null 2>&1; then
        log "Docker is ready."
        return 0
      fi
      sleep 2
    done
  fi

  echo "Docker daemon is not running. Start Docker Desktop and retry." >&2
  exit 1
}

compose_project_name() {
  # Match `docker compose` default: lowercase directory name.
  basename "$ROOT_DIR" | tr '[:upper:]' '[:lower:]'
}

remove_legacy_containers() {
  local project
  project="$(compose_project_name)"
  local name
  for name in salesai-postgres salesai-searxng salesai-crawl4ai; do
    if ! docker container inspect "$name" >/dev/null 2>&1; then
      continue
    fi

    local owner
    owner="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$name" 2>/dev/null || true)"
    if [[ "$owner" == "$project" ]]; then
      continue
    fi

    log "Removing legacy container ${name} so Compose can manage it..."
    docker rm -f "$name" >/dev/null
  done
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local attempts="${3:-30}"

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      log "$name is up ($url)."
      return 0
    fi
    sleep 1
  done

  warn "$name is not responding yet at $url (continuing)."
  return 0
}

wait_for_postgres() {
  local port="$1"
  local attempts=40

  for _ in $(seq 1 "$attempts"); do
    if docker exec salesai-postgres pg_isready -U salesai -d salesai >/dev/null 2>&1; then
      log "Postgres is ready on localhost:${port}."
      return 0
    fi
    sleep 1
  done

  echo "Postgres container did not become ready on localhost:${port}." >&2
  exit 1
}

ensure_ollama() {
  if ! command -v ollama >/dev/null 2>&1; then
    warn "Ollama is not installed. Lead Search AI features will be limited."
    return 0
  fi

  if curl -fsS --max-time 2 "${OLLAMA_BASE_URL:-http://localhost:11434}" >/dev/null 2>&1; then
    log "Ollama is already running."
  else
    log "Starting Ollama..."
    # ollama serve keeps running; leave it detached for the session
    nohup ollama serve >work/ollama.log 2>&1 &
    echo $! >work/ollama.pid
    wait_for_http "Ollama" "${OLLAMA_BASE_URL:-http://localhost:11434}" 30
  fi

  local model="${OLLAMA_MODEL:-qwen2.5:7b}"
  if ! ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -qx "$model"; then
    log "Pulling Ollama model ${model} (first run may take a while)..."
    ollama pull "$model" || warn "Could not pull ${model}. Install it later with: ollama pull ${model}"
  else
    log "Ollama model ${model} is available."
  fi
}

start_queue_worker() {
  log "Starting auto-send queue poller (every 60s)..."
  (
    while true; do
      npm run queue:auto-send -- --limit=10 >>work/auto-send-queue.log 2>&1 || true
      sleep 60
    done
  ) &
  echo $! >work/auto-send-worker.pid
}

cleanup() {
  if [[ -f work/auto-send-worker.pid ]]; then
    kill "$(cat work/auto-send-worker.pid)" >/dev/null 2>&1 || true
    rm -f work/auto-send-worker.pid
  fi
}

mkdir -p work
ensure_env

POSTGRES_PORT="$(parse_database_port)"
export POSTGRES_PORT
export CRAWL4AI_API_TOKEN="${CRAWL4AI_API_TOKEN:-}"

log "Using Postgres port ${POSTGRES_PORT} from DATABASE_URL."
ensure_docker
remove_legacy_containers

log "Starting Docker services (Postgres, SearXNG, Crawl4AI)..."
docker compose up -d --remove-orphans

wait_for_postgres "$POSTGRES_PORT"
wait_for_http "SearXNG" "${SEARXNG_URL:-http://127.0.0.1:8080}" 40
wait_for_http "Crawl4AI" "${CRAWL4AI_URL:-http://localhost:11235}/health" 60 || \
  wait_for_http "Crawl4AI" "${CRAWL4AI_URL:-http://localhost:11235}" 10

ensure_ollama

if [[ ! -d node_modules ]]; then
  log "Installing npm dependencies..."
  npm install
fi

if [[ "$SKIP_MIGRATE" -eq 0 ]]; then
  log "Applying database migrations..."
  npm run db:migrate
fi

if [[ "$SKIP_SEED" -eq 0 ]]; then
  log "Seeding database..."
  npm run db:seed
fi

if [[ "$WITH_QUEUE" -eq 1 ]]; then
  start_queue_worker
fi

trap cleanup EXIT INT TERM

if [[ "$FOREGROUND_APP" -eq 0 ]]; then
  log "Containers and Ollama are up. Start the app with: npm run dev"
  log "Stop containers with: npm run dev:down"
  trap - EXIT INT TERM
  exit 0
fi

log "Starting Next.js on http://localhost:3000"
log "Stop containers later with: npm run dev:down"
npm run dev
