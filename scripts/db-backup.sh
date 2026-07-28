#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STAMP="$(date +"%Y%m%d-%H%M%S")"
BACKUP_DIR="${BACKUP_DIR:-work/backups}"
OUTPUT_PATH="${1:-$BACKUP_DIR/salesai-${STAMP}.sql.gz}"

mkdir -p "$BACKUP_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to back up PostgreSQL." >&2
  exit 1
fi

if ! docker container inspect salesai-postgres >/dev/null 2>&1; then
  echo "Container salesai-postgres not found. Run npm run dev:up first." >&2
  exit 1
fi

echo "==> Creating backup at ${OUTPUT_PATH}"
docker exec salesai-postgres pg_dump -U salesai -d salesai \
  | gzip > "$OUTPUT_PATH"

echo "==> Backup complete: ${OUTPUT_PATH}"
