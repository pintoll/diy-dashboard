#!/usr/bin/env bash
# Trigger a workflow execution via the n8n CLI inside the n8n container.
# Usage:
#   test.sh <workflowId>                # run by id
#   test.sh --name "Daily News"         # resolve id from name
#
# Note: n8n public REST API has no "execute now" endpoint for non-webhook
# triggers, so we shell into the container and use the n8n CLI.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

# Find n8n app container (not the postgres one).
N8N_CONTAINER="${N8N_APP_CONTAINER:-}"
if [[ -z "$N8N_CONTAINER" ]]; then
  N8N_CONTAINER=$(n8n_ssh "docker ps --format '{{.Names}}\t{{.Image}}' | grep -iE 'n8nio/n8n|n8n:' | head -1 | awk '{print \$1}'") || true
fi
[[ -n "$N8N_CONTAINER" ]] || { echo "ERR: n8n container not found. Set N8N_APP_CONTAINER in .env.local" >&2; exit 1; }

ID="${1:-}"
if [[ "$ID" == "--name" ]]; then
  shift
  NAME="${1:?usage: test.sh --name \"<workflow name>\"}"
  require jq
  ID=$(n8n_api GET "/workflows?limit=250" | jq -r --arg n "$NAME" '.data[] | select(.name==$n) | .id' | head -1)
  [[ -n "$ID" ]] || { echo "ERR: no workflow named '$NAME'" >&2; exit 1; }
  echo "→ resolved '$NAME' → id=$ID"
fi

[[ -n "$ID" ]] || { echo "usage: test.sh <id> | --name \"<name>\"" >&2; exit 2; }

echo "→ executing workflow ${ID} in container ${N8N_CONTAINER} …"
n8n_ssh "docker exec '${N8N_CONTAINER}' n8n execute --id='${ID}'"
