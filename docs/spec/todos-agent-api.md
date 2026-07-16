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

All fields optional. Setting `done: true` stamps `completedOn` and steps the todo off the desk if it was a member (banking its open interval). Setting `done: false` clears `completedOn`.

### `DELETE /api/todos/:id`

```
DELETE /api/todos/abc123
→ 204
```

Cascades its pomodoro session links and drops it from the desk if it was a member.

### The desk

The **desk** is the *set* of todos currently receiving the running work clock
(see `docs/design/multi-pomo-todo.md`). Membership, not ownership, routes time:
while a work pomodoro runs, **every** desk member accrues wall-clock time
independently — time is not divided. It supersedes the single active-todo model.

#### `GET /api/desk`

```
GET /api/desk
→ 200 { "todos": [ ...Todo ] }   // desk members, oldest join first
```

#### `POST /api/desk`

```
POST /api/desk
{ "id": "abc123" }
→ 200 { "todos": [ ...Todo ] }   // the full desk after adding
```

**Additive** — adds one member; it does not replace the desk. Adding a member
already present is a no-op. Adding a completed todo is a `400`; an unknown id is
a `404`.

#### `DELETE /api/desk/:id`

```
DELETE /api/desk/abc123
→ 200 { "todos": [ ...Todo ] }   // the full desk after removing
```

Removes one member (removing an absent id is a no-op). A member's open in-flight
interval is banked before it leaves.

#### `DELETE /api/desk`

```
DELETE /api/desk
→ 200 { "todos": [] }            // desk cleared
```

### `GET /api/active-todo` · `POST /api/active-todo` — deprecated

Kept one release as a single-active compat shim over the desk. `GET` returns the
first desk member (`{ "todo": {...} | null }`); `POST { "id" }` **collapses** the
desk to just that todo, `POST { "id": null }` clears it. New clients use the desk
routes above; these will be removed once no un-updated `dyd` install remains.

## Pomodoro linkage

While a pomodoro **work** phase runs, every todo on the desk accrues the elapsed
wall-clock time onto its `workedSec`. Accrual is per **in-flight interval**, not
only at session end — a member banks its partial time when it leaves the desk, is
completed, or the phase ends, and keeps accruing on the next pomo if still open.

- One todo accumulates many intervals across many sessions; one session can
  credit **several** todos (one ledger row per interval, keyed on a surrogate
  `attribution_id`), so a retried write never double-counts.
- `worked_sec` therefore means "focused-clock wall time this task was in flight,"
  and `sum(worked_sec)` across todos **can exceed** the day's real focus time by
  design (overlaps allowed). A no-double-count day total comes from the session
  log, never from summing this rollup.
- Empty desk while a session runs → nothing accrues.

An agent that puts a todo on the desk before the user works is, in effect,
deciding that todo's time gets recorded.

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
