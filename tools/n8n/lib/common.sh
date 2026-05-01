#!/usr/bin/env bash
# Shared helpers for tools/n8n scripts. Source-only; do not run directly.

set -euo pipefail

_TOOLS_N8N_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${_TOOLS_N8N_DIR}/.env.local"
WORKFLOWS_DIR="${_TOOLS_N8N_DIR}/workflows"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERR: $ENV_FILE missing. Copy .env.example and fill values." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${N8N_SSH_KEY:?N8N_SSH_KEY missing in .env.local}"
: "${N8N_SSH_USER:?N8N_SSH_USER missing}"
: "${N8N_SSH_HOST:?N8N_SSH_HOST missing}"
: "${N8N_URL:?N8N_URL missing}"
: "${N8N_API_KEY:?N8N_API_KEY missing}"

N8N_SSH_KEY="${N8N_SSH_KEY/#\~/$HOME}"
N8N_SQLITE_PATH="${N8N_SQLITE_PATH:-/home/node/.n8n/database.sqlite}"

have()    { command -v "$1" >/dev/null 2>&1; }
require() { have "$1" || { echo "ERR: '$1' not found locally." >&2; exit 1; }; }

# --- SSH ---
n8n_ssh() {
  # shellcheck disable=SC2086
  ssh -i "$N8N_SSH_KEY" $N8N_SSH_OPTS \
    -o ConnectTimeout=10 \
    -o ServerAliveInterval=30 \
    "${N8N_SSH_USER}@${N8N_SSH_HOST}" "$@"
}

# --- n8n REST API ---
n8n_api() {
  local method="$1"; shift
  local path="$1"; shift
  curl -fsS -X "$method" \
    -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
    -H "Accept: application/json" \
    -H "Content-Type: application/json" \
    "${N8N_URL%/}/api/v1${path}" \
    "$@"
}

# Resolve n8n app container name if not set.
n8n_app_container() {
  if [[ -z "${N8N_APP_CONTAINER:-}" ]]; then
    N8N_APP_CONTAINER=$(n8n_ssh "docker ps --format '{{.Names}}\t{{.Image}}' | grep -iE 'n8nio/n8n|n8n:' | head -1 | awk '{print \$1}'") || true
  fi
  [[ -n "${N8N_APP_CONTAINER:-}" ]] || { echo "ERR: n8n container not found. Set N8N_APP_CONTAINER." >&2; exit 1; }
  echo "$N8N_APP_CONTAINER"
}

# Discover the host bind-mount path for n8n's data dir.
# Result cached in /tmp/n8n-bindpath.
_n8n_bind_path() {
  local cache=/tmp/n8n-bindpath
  if [[ -s "$cache" ]] && [[ $(($(date +%s) - $(stat -c %Y "$cache"))) -lt 3600 ]]; then
    cat "$cache"; return
  fi
  local c
  c="$(n8n_app_container)"
  local p
  p=$(n8n_ssh "docker inspect '${c}' --format '{{range .Mounts}}{{if eq .Destination \"/home/node/.n8n\"}}{{.Source}}{{end}}{{end}}'") || true
  [[ -n "$p" ]] || { echo "ERR: could not resolve bind path for ${N8N_SQLITE_PATH}" >&2; exit 1; }
  echo "$p" | tee "$cache" >/dev/null
  echo "$p"
}

# Snapshot the live n8n SQLite (incl. WAL/SHM) to a local /tmp dir for read-only queries.
# Echoes the local path to the snapshot DB.
_n8n_snapshot() {
  local snap=/tmp/n8n-debug
  mkdir -p "$snap"
  local bind
  bind="$(_n8n_bind_path)"
  # Pull all three files atomically so WAL stays consistent with the main DB.
  # tar handles missing -shm/-wal gracefully.
  if ! n8n_ssh "tar cf - -C '${bind}' database.sqlite database.sqlite-wal database.sqlite-shm 2>/dev/null" \
     | tar xf - -C "$snap" 2>/dev/null; then
    echo "ERR: snapshot transfer failed" >&2
    exit 1
  fi
  echo "${snap}/database.sqlite"
}

# Run SQL against an offline snapshot of n8n's SQLite.
# Usage: n8n_sqlite "SELECT ..."
#        echo "..." | n8n_sqlite
#        n8n_sqlite --shell           # only if local sqlite3 installed
n8n_sqlite() {
  local db
  db="$(_n8n_snapshot)"

  if [[ "${1:-}" == "--shell" ]]; then
    if have sqlite3; then
      exec sqlite3 "$db"
    fi
    echo "ERR: sqlite3 CLI not installed locally." >&2
    echo "     Install with: sudo apt install sqlite3" >&2
    echo "     (Or pass SQL inline: db.sh \"SELECT ...\")" >&2
    exit 1
  fi

  require python3
  if [[ $# -gt 0 ]]; then
    python3 "${_TOOLS_N8N_DIR}/lib/sqlite_query.py" "$db" "$*"
  else
    python3 "${_TOOLS_N8N_DIR}/lib/sqlite_query.py" "$db"
  fi
}

# Run psql against the app Postgres (the 'dashboard' DB).
app_db() {
  : "${APP_DB_CONTAINER:?APP_DB_CONTAINER not set in .env.local}"
  : "${APP_DB_USER:?APP_DB_USER not set}"
  : "${APP_DB_NAME:?APP_DB_NAME not set}"

  if [[ "${1:-}" == "--shell" ]]; then
    exec ssh -t -i "$N8N_SSH_KEY" $N8N_SSH_OPTS \
      "${N8N_SSH_USER}@${N8N_SSH_HOST}" \
      "docker exec -it -e PGPASSWORD='${APP_DB_PASSWORD}' '${APP_DB_CONTAINER}' psql -U '${APP_DB_USER}' -d '${APP_DB_NAME}'"
  fi

  if [[ $# -gt 0 ]]; then
    local sql="$*"
    n8n_ssh "docker exec -i -e PGPASSWORD='${APP_DB_PASSWORD}' '${APP_DB_CONTAINER}' psql -U '${APP_DB_USER}' -d '${APP_DB_NAME}' -P pager=off -c \"$(printf '%s' "$sql" | sed 's/"/\\"/g')\""
  else
    n8n_ssh "docker exec -i -e PGPASSWORD='${APP_DB_PASSWORD}' '${APP_DB_CONTAINER}' psql -U '${APP_DB_USER}' -d '${APP_DB_NAME}' -P pager=off"
  fi
}

# Pretty JSON helper.
pp() {
  if have jq; then jq "${1:-.}"
  else cat
  fi
}
