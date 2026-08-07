#!/usr/bin/env bash
# Sync local Confirm + 連絡進捗 onto production by matching company domain.
# Usage:
#   npx tsx scripts/sync-local-status-to-prod.ts
#   npx tsx scripts/sync-local-status-to-prod.ts --dry-run
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
exec npx tsx scripts/sync-local-status-to-prod.ts "$@"
