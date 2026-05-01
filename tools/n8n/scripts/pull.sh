#!/usr/bin/env bash
# Export workflows from n8n into tools/n8n/workflows/ as JSON for git tracking.
# Usage:
#   pull.sh             # pull all workflows
#   pull.sh <id>        # pull a single workflow

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"
require jq

mkdir -p "$WORKFLOWS_DIR"

slugify() {
  # lowercase, replace non-alnum with -, collapse and trim
  echo "$1" | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g'
}

dump_one() {
  local id="$1"
  local wf
  wf=$(n8n_api GET "/workflows/${id}")
  local name slug file
  name=$(echo "$wf" | jq -r '.name')
  slug=$(slugify "$name")
  file="${WORKFLOWS_DIR}/${slug}__${id}.json"
  # Strip volatile fields for cleaner diffs
  echo "$wf" | jq '{id, name, active, nodes, connections, settings, staticData, tags, pinData, meta}' > "$file"
  echo "→ $file"
}

if [[ $# -eq 1 ]]; then
  dump_one "$1"
else
  ids=$(n8n_api GET "/workflows?limit=250" | jq -r '.data[].id')
  for id in $ids; do dump_one "$id"; done
fi

echo
echo "Done. Review with: git diff -- tools/n8n/workflows/"
