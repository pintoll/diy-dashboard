#!/usr/bin/env bash
# Validates env, SSH, n8n API, and discovers container layout.
# Run after editing .env.local. Reports values to paste back.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
err()  { printf '\033[31m✗\033[0m %s\n' "$*"; }

echo "=== Local tooling ==="
have curl && ok "curl" || err "curl missing"
have jq   && ok "jq"   || warn "jq missing — install with: sudo apt install jq"
have ssh  && ok "ssh"  || err "ssh missing"

echo
echo "=== SSH ==="
if n8n_ssh "echo ssh-ok" >/dev/null; then
  ok "SSH reachable: ${N8N_SSH_USER}@${N8N_SSH_HOST}"
else
  err "SSH failed."
  exit 1
fi

echo
echo "=== n8n REST API ==="
status=$(curl -sS -o /tmp/n8n-doctor.json -w '%{http_code}' \
    -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
    "${N8N_URL%/}/api/v1/workflows?limit=1") || true
if [[ "$status" == "200" ]]; then
  if have jq; then
    count=$(jq -r '.data | length' /tmp/n8n-doctor.json)
    total=$(jq -r '.nextCursor // "n/a"' /tmp/n8n-doctor.json)
    ok "API reachable: ${N8N_URL} (sample workflows: ${count}, nextCursor: ${total})"
  else
    ok "API reachable: ${N8N_URL}"
  fi
else
  err "API HTTP ${status}:"
  cat /tmp/n8n-doctor.json
  exit 1
fi

echo
echo "=== Containers on host ==="
n8n_ssh "docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'"

echo
echo "=== n8n app container ==="
APP=$(n8n_ssh "docker ps --format '{{.Names}}\t{{.Image}}' | grep -iE 'n8nio/n8n|n8n:' | head -1 | awk '{print \$1}'") || true
if [[ -z "$APP" ]]; then
  err "No n8n container detected."
else
  ok "Detected: ${APP}"
  [[ "$APP" == "${N8N_APP_CONTAINER:-}" ]] && ok ".env.local matches" \
    || warn "Set N8N_APP_CONTAINER=${APP} in .env.local"
fi

echo
echo "=== n8n SQLite (read via host bind-mount + python3) ==="
if [[ -n "$APP" ]]; then
  bind=$(n8n_ssh "docker inspect '${APP}' --format '{{range .Mounts}}{{if eq .Destination \"/home/node/.n8n\"}}{{.Source}}{{end}}{{end}}'") || true
  if [[ -z "$bind" ]]; then
    err "Could not resolve host bind path for /home/node/.n8n"
  else
    ok "Host bind path: ${bind}"
    if n8n_ssh "test -r '${bind}/database.sqlite'"; then
      size=$(n8n_ssh "ls -lh '${bind}/database.sqlite' | awk '{print \$5}'")
      ok "SQLite readable on host (${size})"
    else
      err "Cannot read ${bind}/database.sqlite as ${N8N_SSH_USER}"
    fi
    if have python3; then
      ok "python3 present locally (used to query the snapshot)"
    else
      err "python3 missing locally — required for db.sh"
    fi
    # Try a real query end-to-end
    if cnt=$("${SCRIPT_DIR}/db.sh" "SELECT count(*) AS n FROM execution_entity;" 2>&1); then
      ok "db.sh end-to-end works:"
      echo "$cnt" | sed 's/^/   /'
    else
      err "db.sh failed:"
      echo "$cnt" | sed 's/^/   /'
    fi
  fi
fi

echo
echo "=== App Postgres (optional) ==="
PG=$(n8n_ssh "docker ps --format '{{.Names}}\t{{.Image}}' | grep -iE 'postgres|pg' | head -1 | awk '{print \$1}'") || true
if [[ -z "$PG" ]]; then
  warn "No postgres container — skipping app DB checks."
else
  ok "Detected: ${PG}"
  PG_ENV=$(n8n_ssh "docker exec '${PG}' env | grep -E '^POSTGRES_' || true")
  PG_USER=$(echo "$PG_ENV" | awk -F= '/^POSTGRES_USER=/{print $2}')
  PG_DB=$(echo   "$PG_ENV" | awk -F= '/^POSTGRES_DB=/{print $2}')
  PG_PASS=$(echo "$PG_ENV" | awk -F= '/^POSTGRES_PASSWORD=/{print $2}')
  echo "  POSTGRES_USER=${PG_USER}  POSTGRES_DB=${PG_DB}  POSTGRES_PASSWORD=${PG_PASS:+***}"

  # Suggest .env.local lines
  echo
  echo "  Suggested .env.local app DB block:"
  echo "    APP_DB_CONTAINER=${PG}"
  echo "    APP_DB_USER=${PG_USER}"
  echo "    APP_DB_NAME=${PG_DB}"
  echo "    APP_DB_PASSWORD=${PG_PASS}"

  if [[ -n "${APP_DB_USER:-}" && -n "${APP_DB_NAME:-}" ]]; then
    if n8n_ssh "docker exec -e PGPASSWORD='${APP_DB_PASSWORD}' '${APP_DB_CONTAINER}' psql -U '${APP_DB_USER}' -d '${APP_DB_NAME}' -tAc 'SELECT 1'" >/dev/null 2>&1; then
      ok "app DB connection works"
    else
      warn "app DB env set but connection failed — check values above"
    fi
  fi
fi

echo
echo "Done."
