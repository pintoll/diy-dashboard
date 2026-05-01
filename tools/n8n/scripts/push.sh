#!/usr/bin/env bash
# Push a local workflow JSON back to n8n (update existing by id, or create new).
# Usage:
#   push.sh tools/n8n/workflows/daily-news__123.json          # update id from file
#   push.sh path/to.json --create                              # create new

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"
require jq

FILE="${1:?usage: push.sh <file.json> [--create]}"
MODE="${2:-update}"

[[ -f "$FILE" ]] || { echo "ERR: $FILE not found" >&2; exit 1; }

# n8n PUT/POST accepts: name, nodes, connections, settings (optionally staticData).
# Strip read-only fields.
PAYLOAD=$(jq '{name, nodes, connections, settings: (.settings // {}), staticData: (.staticData // null)}' "$FILE")

if [[ "$MODE" == "--create" ]]; then
  echo "Creating new workflow from $FILE …"
  RESP=$(echo "$PAYLOAD" | n8n_api POST "/workflows" --data @-)
  echo "$RESP" | pp '{id, name, active}'
else
  ID=$(jq -r '.id' "$FILE")
  [[ -n "$ID" && "$ID" != "null" ]] || { echo "ERR: no .id in $FILE — use --create" >&2; exit 1; }
  echo "Updating workflow ${ID} from $FILE …"
  RESP=$(echo "$PAYLOAD" | n8n_api PUT "/workflows/${ID}" --data @-)
  echo "$RESP" | pp '{id, name, active, updatedAt}'
fi
