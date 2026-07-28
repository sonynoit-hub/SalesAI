#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

INPUT_PATH="${1:-}"

if [[ -z "$INPUT_PATH" ]]; then
  echo "Usage: scripts/db-restore.sh <backup.sql.gz|backup.sql>" >&2
  exit 1
fi

if [[ ! -f "$INPUT_PATH" ]]; then
  echo "Backup file not found: $INPUT_PATH" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to restore PostgreSQL." >&2
  exit 1
fi

if ! docker container inspect salesai-postgres >/dev/null 2>&1; then
  echo "Container salesai-postgres not found. Run npm run dev:up first." >&2
  exit 1
fi

echo "!! This will overwrite local salesai database data."
echo "==> Restoring from ${INPUT_PATH}"

if [[ "$INPUT_PATH" == *.gz ]]; then
  gunzip -c "$INPUT_PATH" | docker exec -i salesai-postgres psql -U salesai -d salesai
else
  docker exec -i salesai-postgres psql -U salesai -d salesai < "$INPUT_PATH"
fi

echo "==> Restore complete."
