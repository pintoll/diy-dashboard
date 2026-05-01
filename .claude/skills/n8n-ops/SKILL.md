---
name: n8n-ops
description: Manage the project's remote self-hosted n8n server (debug failed executions, run SQL on n8n's SQLite, query the dashboard Postgres, pull/push workflows, trigger test runs). Use whenever the user mentions n8n failures, the daily-news workflow, n8n workflow edits, or asks to "check the server" / "see why it failed".
---

# n8n-ops

The project ships a small bash CLI under `tools/n8n/` that talks to a remote self-hosted n8n (docker compose) over SSH and the n8n REST API. Use it instead of MCP — lighter on tokens, gives shell + DB access.

n8n stores its data in **SQLite** inside the container at `/home/node/.n8n/database.sqlite`. The dashboard app uses a **separate Postgres** container — the two are unrelated stores.

## When to invoke

- "왜 daily news가 안 됐어?" / "n8n 실패 봐줘" → `failures.sh` then `logs.sh <id>`.
- "execution_data 봐줘" / "SQLite 들어가서" → `db.sh "<SQL>"`.
- "dashboard DB에 들어왔는지 확인" → `appdb.sh "<SQL>"`.
- "워크플로우 X 수정" → `pull.sh <id>` → edit JSON → `push.sh <file>` → `test.sh <id>`.
- 새 환경 / 처음 작동 안 할 때 → `doctor.sh`.

## Files

- `tools/n8n/.env.local` — secrets (host, key, API key, DB creds). Gitignored.
- `tools/n8n/lib/common.sh` — `n8n_ssh`, `n8n_api`, `n8n_sqlite`, `app_db`.
- `tools/n8n/scripts/{doctor,failures,logs,db,appdb,pull,push,test}.sh`.
- `tools/n8n/workflows/*.json` — exported workflows, git-tracked.

## Quick recipes

```bash
# Triage
tools/n8n/scripts/failures.sh 10
tools/n8n/scripts/logs.sh <execId>

# Deep dive (SQLite)
tools/n8n/scripts/db.sh "SELECT data FROM execution_data WHERE executionId='<id>';"

# Did the workflow's output land in the app DB?
tools/n8n/scripts/appdb.sh "SELECT count(*) FROM articles WHERE created_at > now() - interval '1 day';"

# Workflow edit cycle
tools/n8n/scripts/pull.sh <wfId>
# edit tools/n8n/workflows/<slug>__<id>.json
tools/n8n/scripts/push.sh tools/n8n/workflows/<slug>__<id>.json
tools/n8n/scripts/test.sh <wfId>
```

`pnpm n8n:*` aliases mirror each script — see `package.json`.

## Conventions

- Always `pull.sh` before editing so the JSON reflects current server state.
- After `push.sh`, run `test.sh` then `failures.sh` to confirm green.
- Commit workflow JSON changes with intent messages; the diff is reviewable.
- Don't hand-edit `id`/`createdAt`/`updatedAt` — `push.sh` strips them.

## Schema cheat sheet (n8n SQLite)

- `execution_entity` — id, workflowId, status, startedAt, stoppedAt, finished, mode
- `execution_data` — executionId, data (large JSON blob)
- `workflow_entity` — id, name, active, nodes, connections, staticData
- `credentials_entity`, `webhook_entity`, `tag_entity`, `workflows_tags`

## Troubleshooting

- "ERR: $ENV_FILE missing" → `cp .env.example .env.local` and fill it.
- API HTTP 401 → API key expired. n8n UI → Settings → n8n API → new key → update `.env.local`.
- `db.sh` fails with "sqlite3: not found" → containers were recreated; `doctor.sh` reinstalls sqlite3.
- SSH timeout → check EC2 status and that your IP is in the security group.
