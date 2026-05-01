#!/usr/bin/env bash
# Run SQL on n8n's internal SQLite DB (executions, workflows, credentials, etc.)
# via SSH + docker exec. SQLite3 will be apk-installed in the container if missing.
#
# Usage:
#   db.sh "SELECT id, status FROM execution_entity ORDER BY startedAt DESC LIMIT 5;"
#   echo "SELECT 1;" | db.sh
#   db.sh --shell                     # interactive sqlite3
#
# Common tables (n8n SQLite schema):
#   execution_entity, execution_data, workflow_entity, credentials_entity,
#   webhook_entity, settings, tag_entity, workflows_tags, user, shared_workflow.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

if [[ "${1:-}" == "--shell" ]]; then
  n8n_sqlite --shell
fi

if [[ $# -gt 0 ]]; then
  n8n_sqlite "$*"
elif [[ ! -t 0 ]]; then
  n8n_sqlite
else
  echo "usage: db.sh \"<SQL>\" | echo SQL | db.sh | db.sh --shell" >&2
  exit 2
fi
