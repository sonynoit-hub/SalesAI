#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WITH_SEED=0

for arg in "$@"; do
  case "$arg" in
    --seed) WITH_SEED=1 ;;
    -h|--help)
      cat <<'EOF'
Usage: scripts/dev-start.sh [--seed]

Starts local stack, applies migrations, then Next.js.

  --seed   Also run db:seed (optional; default is skip to keep your data)

EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

log() {
  printf '==> %s\n' "$*"
}

log "Starting Docker services + Ollama (no Next.js yet)..."
bash scripts/dev-up.sh --containers --skip-migrate

log "Applying database migrations (deploy; does not reset data)..."
npm run db:generate
npm run db:deploy

if [[ "$WITH_SEED" -eq 1 ]]; then
  log "Seeding database (sample upsert only)..."
  npm run db:seed
else
  log "Skipping seed (keeps existing data). Pass --seed to run it."
fi

log "Starting Next.js on http://localhost:3000"
log "Stop containers later with: npm run dev:down"
npm run dev
