#!/usr/bin/env bash
# Run psql on the dashboard app's Postgres DB (separate from n8n's SQLite).
# Use this when debugging what the workflow wrote/didn't write to the app's tables.
#
# Usage:
#   appdb.sh "SELECT * FROM articles ORDER BY created_at DESC LIMIT 5;"
#   echo "SELECT 1;" | appdb.sh
#   appdb.sh --shell

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

if [[ "${1:-}" == "--shell" ]]; then
  app_db --shell
fi

if [[ $# -gt 0 ]]; then
  app_db "$*"
elif [[ ! -t 0 ]]; then
  app_db
else
  echo "usage: appdb.sh \"<SQL>\" | echo SQL | appdb.sh | appdb.sh --shell" >&2
  exit 2
fi
