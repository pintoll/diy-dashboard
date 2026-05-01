# tools/n8n

Project-scoped CLI for the remote self-hosted n8n. No MCP, no extra deps — `bash`, `curl`, `ssh`, `jq`. n8n stores its data in **SQLite** inside the container; the dashboard app uses a separate Postgres.

## Setup

```bash
cp tools/n8n/.env.example tools/n8n/.env.local       # then fill values
chmod +x tools/n8n/scripts/*.sh
tools/n8n/scripts/doctor.sh                          # validates + auto-installs sqlite3 in container
```

`.env.local` is gitignored (root `.gitignore` excludes `.env*`).

## Daily ops

```bash
pnpm n8n:doctor                                      # health check (run this first)
pnpm n8n:failures                                    # last 20 failed executions (REST)
pnpm n8n:failures 50 --status=crashed                # tweak limit/status
pnpm n8n:logs <execId>                               # node-by-node breakdown
pnpm n8n:logs <execId> --raw                         # raw JSON

pnpm n8n:db "SELECT id, status, startedAt FROM execution_entity ORDER BY startedAt DESC LIMIT 5;"
pnpm n8n:db --shell                                  # interactive sqlite3
pnpm n8n:appdb "SELECT count(*) FROM articles;"      # raw psql on dashboard DB
pnpm n8n:appdb --shell

pnpm n8n:pull                                        # export all workflows → workflows/
pnpm n8n:pull <wfId>                                 # one workflow only
pnpm n8n:push tools/n8n/workflows/daily-news__123.json
pnpm n8n:test <wfId>                                 # trigger a run via n8n CLI
pnpm n8n:test --name "Daily News"
```

## Layer choice

| Layer        | Tool                         | When                                                |
| ------------ | ---------------------------- | --------------------------------------------------- |
| REST API     | `failures`, `logs`, `pull`, `push` | First reach. Read-mostly. Fast.                |
| n8n SQLite   | `db`                         | Deep debugging — execution_data payloads, joins.    |
| App Postgres | `appdb`                      | Was the workflow's *output* written to the app?     |
| Docker exec  | `test`                       | Manually trigger a run (no public REST equivalent). |

## Useful queries

n8n SQLite:

```sql
-- Recent failures with workflow name
SELECT e.id, e.startedAt, e.status, w.name
FROM execution_entity e JOIN workflow_entity w ON w.id = e.workflowId
WHERE e.status IN ('error','crashed')
ORDER BY e.startedAt DESC LIMIT 20;

-- Failure rate by workflow last 7 days
SELECT w.name,
       sum(e.status='success')                    AS ok,
       sum(e.status IN ('error','crashed'))       AS fail
FROM execution_entity e JOIN workflow_entity w ON w.id = e.workflowId
WHERE e.startedAt > datetime('now','-7 days')
GROUP BY w.name ORDER BY fail DESC;

-- Full payload of one execution (large!)
SELECT data FROM execution_data WHERE executionId = '<id>';
```

## Files

```
tools/n8n/
├── .env.example          # template (git-tracked)
├── .env.local            # secrets (gitignored)
├── lib/common.sh         # n8n_ssh, n8n_api, n8n_sqlite, app_db
├── scripts/              # one verb per file
│   ├── doctor.sh
│   ├── failures.sh
│   ├── logs.sh
│   ├── db.sh             # n8n SQLite
│   ├── appdb.sh          # dashboard Postgres
│   ├── pull.sh
│   ├── push.sh
│   └── test.sh
└── workflows/            # exported workflow JSON, git-tracked
```

## Notes

- Workflow JSON dumps strip volatile fields for clean diffs.
- `test.sh` uses `docker exec ... n8n execute` because the public REST API has no manual-execute endpoint for non-webhook workflows.
- First call to `db.sh` on a fresh container will `apk add sqlite` automatically (one-time per container).
- Reads on the live SQLite are safe — n8n runs in WAL mode.
