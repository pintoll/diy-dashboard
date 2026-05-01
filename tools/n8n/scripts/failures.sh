#!/usr/bin/env bash
# List recent failed n8n executions.
# Usage:
#   failures.sh [LIMIT] [--workflow=<id>] [--status=error|crashed|waiting]

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

LIMIT=20
STATUS=error
WF_ID=

for arg in "$@"; do
  case "$arg" in
    --workflow=*) WF_ID="${arg#*=}" ;;
    --status=*)   STATUS="${arg#*=}" ;;
    [0-9]*)       LIMIT="$arg" ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

QS="status=${STATUS}&limit=${LIMIT}"
[[ -n "$WF_ID" ]] && QS="${QS}&workflowId=${WF_ID}"

if have jq; then
  n8n_api GET "/executions?${QS}" | jq -r '
    .data[] | [
      .id,
      (.startedAt // .createdAt | sub("\\.\\d+Z$"; "Z")),
      .status,
      (.workflowId // "?"),
      (.workflowData.name // "?"),
      (if .stoppedAt then ((.stoppedAt|fromdateiso8601) - (.startedAt|fromdateiso8601) | tostring + "s") else "-" end)
    ] | @tsv
  ' | column -t -s $'\t' -N 'EXEC,STARTED,STATUS,WF_ID,NAME,DUR'
else
  n8n_api GET "/executions?${QS}"
fi
