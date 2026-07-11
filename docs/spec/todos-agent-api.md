# Todos — Local Agent API

HTTP interface exposed by the Electron main process so a local agent (CLI, script, Claude Code) can read and write todos while the app runs.

- Bound to `127.0.0.1` only. Nothing is served off-machine.
- Runs only while the app is running. Otherwise requests fail with `ECONNREFUSED` — there is no daemon.
- **Do not open `todos.db` directly.** It is WAL-journaled and owned by the running app. This API is the contract.

## Discovery

Never hardcode the port. Read `<userData>/agent-api.json`:

```json
{
  "port": 8799,
  "token": "5HF1MPXfc9fMzg6NoMMS9aP_Ka3lTlPZ",
  "pid": 431873,
  "startedAt": "2026-07-09T12:40:27.955Z"
}
```

`userData` is Electron's `app.getPath("userData")`: `~/.config/diy-dashboard` (Linux), `%APPDATA%\diy-dashboard` (Windows). The directory is named after `name` in `package.json` — adding a `productName` there would move it.

The app deletes the file on quit, but only if it wrote it — a second instance rewrites the file with its own port and `pid`. A file that survives a crash is detectable via `pid`: check the process is alive, or just call `GET /api/health`.

Default port is `8799`. On `EADDRINUSE` the server falls back to an OS-assigned port, which is why the file is authoritative. Override with `agentApiPort` in `settings.json`.

## Auth

Every route except `GET /api/health` requires the token from the discovery file:

```
Authorization: Bearer <token>
```

Missing or wrong token → `401`. The token is generated once and stored as `agentApiToken` in `settings.json`.

```bash
BASE=http://127.0.0.1:8799
TOKEN=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.config/diy-dashboard/agent-api.json')))['token'])")
AUTH="Authorization: Bearer $TOKEN"
```

## The Todo object

```jsonc
{
  "id": "wpHNyyWea7kRuNwVm_xCv",  // nanoid
  "date": "2026-07-09",           // the day it is PLANNED for (Asia/Seoul)
  "title": "Design the API",
  "note": null,
  "done": false,
  "completedOn": null,            // the day it was FINISHED; independent of `date`
  "sortOrder": 0,                 // manual order within its date
  "workedSec": 1500,              // pomodoro time accrued onto this todo
  "source": "agent",              // "user" | "agent"
  "createdAt": "2026-07-09 12:41:14",
  "updatedAt": "2026-07-09 12:41:14"
}
```

Two rules worth internalizing:

- **`date` is never rewritten by carry-over.** An unfinished todo from Monday stays dated Monday; the UI surfaces it in today's "Overdue" section. Move it only if the user asks.
- **Completing sets `completedOn` to today**, leaving `date` alone. So a past day always shows what was actually planned that day.

## Routes

### `GET /api/health` — no auth

```
GET /api/health
→ 200 { "ok": true, "port": 8799 }
```

Use it to check the app is up before anything else.

### `GET /api/todos`

```
GET /api/todos                                → today (Asia/Seoul)
GET /api/todos?date=2026-07-09                → one day
GET /api/todos?from=2026-07-06&to=2026-07-12  → inclusive range
→ 200 { "todos": [ ...Todo ] }
```

Sorted by `sortOrder`, then creation time. Includes done and open todos.

### `GET /api/todos/overdue`

```
GET /api/todos/overdue
→ 200 { "todos": [ ...Todo ] }
```

Open todos planned before today. This is the carry-over list — they keep their original `date`.

### `POST /api/todos`

```
POST /api/todos
{ "title": "Design the API", "date": "2026-07-09", "note": "optional" }
→ 201 { "todo": {...} }
```

`date` defaults to today. `source` is forced to `"agent"` — you cannot impersonate a user-created todo.

### `PATCH /api/todos/:id`

```
PATCH /api/todos/abc123
{ "title": "...", "note": "...", "date": "2026-07-10", "done": true, "sortOrder": 2 }
→ 200 { "todo": {...} }
```

All fields optional. Setting `done: true` stamps `completedOn` and clears the todo's activation if it was active. Setting `done: false` clears `completedOn`.

### `DELETE /api/todos/:id`

```
DELETE /api/todos/abc123
→ 204
```

Cascades its pomodoro session links. If it was the active todo, nothing is active afterwards.

### `GET /api/active-todo`

```
GET /api/active-todo
→ 200 { "todo": {...} | null }
```

The single globally-active todo — what the pomodoro widget shows as "Working…".

### `POST /api/active-todo`

```
POST /api/active-todo
{ "id": "abc123" }   // or { "id": null } to deactivate
→ 200 { "todo": {...} | null }
```

Activating a completed todo is a `400`. At most one todo is active at a time; activating a second one replaces the first.

## Pomodoro linkage

When a pomodoro work session ends, the todo that is active **at that moment** accrues `durationSec + overtimeSec` onto its `workedSec`.

- One todo accumulates many sessions; one session credits exactly one todo.
- Accrual is idempotent on the session id, so a retried write never double-counts.
- Nothing active at session end → nothing accrues.

An agent that activates a todo before the user starts a session is, in effect, deciding where that session's time gets recorded.

## Errors

```json
{ "error": "date is not a real date: \"2026-13-99\"" }
```

| Code | Meaning |
|---|---|
| `400` | Bad input — malformed date, empty title, non-JSON body, activating a completed todo |
| `401` | Missing or invalid bearer token |
| `404` | Unknown todo id, or unknown route |
| `405` | Route exists, wrong method |
| `500` | Internal error (details are logged app-side, not returned) |

## Live UI updates

Every write — from the app or from this API — broadcasts a `todos:changed` event to the renderer, which reloads after a short debounce (50 ms). An open dashboard picks up an agent's change without user interaction. Nothing extra to call.

## Example: plan tomorrow

```bash
TOMORROW=$(date -d tomorrow +%F)
for t in "Review PR" "Write migration" "Ship release"; do
  curl -s -H "$AUTH" -X POST $BASE/api/todos -d "{\"title\":\"$t\",\"date\":\"$TOMORROW\"}"
done
```

## Example: pick up where the user left off

```bash
# Anything overdue? Activate the oldest so the next pomodoro credits it.
ID=$(curl -s -H "$AUTH" $BASE/api/todos/overdue | python3 -c 'import json,sys; t=json.load(sys.stdin)["todos"]; print(t[0]["id"] if t else "")')
[ -n "$ID" ] && curl -s -H "$AUTH" -X POST $BASE/api/active-todo -d "{\"id\":\"$ID\"}"
```
