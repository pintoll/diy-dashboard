#!/usr/bin/env bash
# Show full execution detail for one n8n execution.
# Usage:
#   logs.sh <execId>          # summary + per-node error/output
#   logs.sh <execId> --raw    # full JSON

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

EXEC_ID="${1:?usage: logs.sh <execId> [--raw]}"
RAW=0
[[ "${2:-}" == "--raw" ]] && RAW=1

JSON=$(n8n_api GET "/executions/${EXEC_ID}?includeData=true")

if [[ $RAW -eq 1 ]] || ! have jq; then
  echo "$JSON" | pp
  exit 0
fi

echo "$JSON" | jq -r '
  "── Execution \(.id)  status=\(.status)  wf=\(.workflowData.name) (\(.workflowId))",
  "   started=\(.startedAt)  stopped=\(.stoppedAt // "-")  mode=\(.mode)",
  ""
'

# Per-node summary: name, items in/out, error if any.
echo "$JSON" | jq -r '
  (.data.resultData.runData // {}) as $rd
  | $rd | to_entries[] |
    .key as $node
    | .value[] as $run
    | [
        $node,
        ($run.executionStatus // "ok"),
        ($run.data.main // [] | map(length) | add // 0),
        ($run.error.message // "")
      ] | @tsv
' | column -t -s $'\t' -N 'NODE,STATUS,ITEMS,ERROR' || true

echo
ERR=$(echo "$JSON" | jq -r '.data.resultData.error // empty')
if [[ -n "$ERR" ]]; then
  echo "── Top-level error ──"
  echo "$JSON" | jq '.data.resultData.error'
fi
