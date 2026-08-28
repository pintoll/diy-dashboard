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
  "date": "2026-07-09",           // the day it is PLANNED for; null = backlog
  "title": "Design the API",
  "note": null,
  "done": false,
  "completedOn": null,            // the day it was FINISHED; independent of `date`
  "sortOrder": 0,                 // manual order within its list (its day, or its inbox/project backlog)
  "workedSec": 1500,              // pomodoro time accrued onto this todo
  "source": "agent",              // "user" | "agent" | "assistant"
  "projectId": null,              // the project it is filed under; null = unfiled
  "createdAt": "2026-07-09 12:41:14",
  "updatedAt": "2026-07-09 12:41:14"
}
```

Days are `YYYY-MM-DD`, and a day runs **05:00 → 05:00 Asia/Seoul**
(`src/shared/day.ts`) — between midnight and 05:00 the calendar date is one day
ahead of the day this API means by "today". Never compute "today" from your own
clock; ask `GET /api/today`, or just omit `date` where the route defaults to it.

Three rules worth internalizing:

- **`date` is never rewritten by carry-over.** An unfinished todo from Monday stays dated Monday; the UI surfaces it in today's "Overdue" section. Move it only if the user asks.
- **Completing sets `completedOn` to today**, leaving `date` alone. So a past day always shows what was actually planned that day.
- **`date: null` means the backlog** — wanted, but with no planned day (`docs/design/todo-backlog.md`). A backlog todo is excluded from *every* dated query, Overdue included, so `GET /api/todos/backlog` is the only way to see it. Park something when the user wants it off the calendar indefinitely; do not park something merely because its day is unclear — ask.
- **`projectId` files a todo under a project** (`docs/design/projects-para.md`). It is never required: capture stays zero-friction and filing is review's job. Combined with `date` it splits the undated bucket in two — `date: null, projectId: null` is the **inbox** (unclassified capture, the todos page's section), and `date: null` with a project is that **project's backlog**, read through `GET /api/projects/:id/todos`.

**The un-park rule.** Work belongs to a day, so anything that means work is happening assigns one:

- adding a backlog todo to the desk sets `date` to today,
- marking a backlog todo done sets `date` to today.

An explicit `date` in the same patch always wins over this.

## Routes

### `GET /api/health` — no auth

```
GET /api/health
→ 200 { "ok": true, "port": 8799 }
```

Use it to check the app is up before anything else.

### `GET /api/today`

```
GET /api/today
→ 200 { "date": "2026-07-09" }
```

The app's current day (05:00-bounded, see above). The source of truth for any
client that needs to name "today" or "tomorrow" explicitly — e.g. `dyd todo
move <n> tomorrow`.

### `GET /api/todos`

```
GET /api/todos                                → today (the app's day)
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

### `GET /api/todos/backlog`

```
GET /api/todos/backlog
→ 200 { "todos": [ ...Todo ] }
```

Todos with `"date": null`. They are invisible to every dated query, so this route is the only way to reach them.

This is the **whole** undated warehouse, project-filed rows included — so a
review sweep here still sees everything. It arrives already grouped: the inbox
first, then each project's backlog in that project's own manual order, projects
by title. Grouping is the route's job because `sortOrder` numbers each of those
lists separately and therefore repeats across them — sorting the rows yourself
by `sortOrder` would interleave the lists. Two consequences worth knowing: the
app's own inbox section shows only the `projectId: null` subset, and rows
belonging to an **archived** project appear here too (filter them out if the
sweep is about active work).

### `GET /api/todos/by-ids`

```
GET /api/todos/by-ids?ids=abc123,def456
→ 200 { "todos": [ ...Todo ] }
```

Batch resolution for callers holding bare todo ids — plan entries reference
todos that may live on another day, in the backlog, or be done. Deleted ids
simply **drop out** of the result rather than `404`ing (show a fallback);
order is unspecified, so key by id. An empty or missing `ids` is a `400`.

### `POST /api/todos`

```
POST /api/todos
{ "title": "Design the API", "date": "2026-07-09", "note": "optional" }
→ 201 { "todo": {...} }
```

Omitting `date` means today; `"date": null` puts the todo straight into the backlog. The two are deliberately different, so a caller that simply does not care about the day still gets today. `source` is forced to `"agent"` — you cannot impersonate a user-created todo.

Keys are strict: anything outside `title`, `date`, `note`, `projectId`, `reason` is a `400`, the same policy `POST /api/apply` applies to a `todo.create` op. A misnamed field must fail loudly rather than be dropped — `{"title": "t", "day": "2026-01-01"}` would otherwise return `201` with the todo silently dated today.

An optional `"reason"` field (one natural-language line, non-empty) records *why* this write happened. It is journal metadata, not part of the todo: it is stripped before the write, stored atomically with it, and later surfaces in the in-app assistant's log (`docs/design/assistant-architecture.md`). A JSON `null` counts as absent, not as an error — some serializers emit `null` for omitted optionals, and the DELETE query-param form cannot distinguish the two; any other empty or non-string `reason` is a `400`. A reason attached to a write that ends up changing nothing (say, re-completing an already-done todo) is not journaled: no op row, no reason row.

### `PATCH /api/todos/:id`

```
PATCH /api/todos/abc123
{ "title": "...", "note": "...", "date": "2026-07-10", "done": true, "sortOrder": 2 }
→ 200 { "todo": {...} }
```

All fields optional. Setting `done: true` stamps `completedOn` and steps the todo off the desk if it was a member (banking its open interval). Setting `done: false` clears `completedOn`.

`"date": null` parks the todo in the backlog; a date pulls it back out. Either way, unless the patch also sets `sortOrder`, a todo that changes bucket is appended to the end of its destination rather than keeping an order number that would drop it into the middle of the other list.

`"projectId"` files or refiles the todo; `null` unfiles it. An unknown project id is a `404`. Pulling a project's backlog item onto a day is an ordinary `"date"` patch here — that is the only path from a project into doing.

Accepts the same optional `"reason"` field as `POST /api/todos`, and the same strict-key policy: anything outside `title`, `note`, `date`, `done`, `sortOrder`, `projectId`, `reason` is a `400` rather than a `200` for a patch that applied nothing.

### `DELETE /api/todos/:id`

```
DELETE /api/todos/abc123
→ 204
```

Cascades its pomodoro session links and drops it from the desk if it was a member.

DELETE reads no body, so the optional reason travels as a query param: `DELETE /api/todos/abc123?reason=duplicate%20of%20xyz` (URL-encoded; same semantics as the `"reason"` body field).

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
a `404`. Adding a **backlog** todo un-parks it: its `date` becomes today, since
it is about to accrue time and time belongs to a day.

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

## Projects — the steering layer

Todos answer "finish today"; **projects** answer "is the right work moving at
all" (`docs/design/projects-para.md`). PARA folded to fit: a project (has an
end) and an area (doesn't) share one shape separated by `kind`, archiving is a
`status` rather than a second bucket, and Resources is out of scope.

**Projects never execute.** The only path from a project into doing is pulling
one of its backlog todos onto a day, which is an ordinary
`PATCH /api/todos/:id` with a `date`. Do not treat a project as a second task
list, and do not invent sub-projects, dependencies, or deadline pressure from
`targetDate` — it is a soft marker and nothing notifies off it.

### The Project object

```jsonc
{
  "id": "kR2m_9xQpLs4vNbT1yWzC",
  "kind": "project",                       // "project" | "area"
  "title": "Ship the projects layer",
  "outcome": "phase 4 merged to main",     // one line: what "done" means; null ok
  "status": "active",                      // "active" | "someday" | "done" | "archived"
  "targetDate": null,                      // YYYY-MM-DD; a soft marker, never a deadline
  "sortOrder": 0,
  "createdAt": "2026-08-27 14:20:01",
  "updatedAt": "2026-08-27 14:20:01",
  "archivedAt": null                       // set when status becomes "archived"
}
```

`archivedAt` is derived, never sent: entering `archived` stamps it, leaving
clears it, and staying archived keeps the original stamp.

### The ProjectDoc object

A project's freeform prose — goals, decisions found mid-work, current state.
Every project is created with one doc titled `notes`.

```jsonc
{
  "id": "b7Xq_2mKdVn8sLpR4tYcE",
  "projectId": "kR2m_9xQpLs4vNbT1yWzC",
  "title": "notes",
  "body": "2026-08-27: wired the schema\nnext: the page",
  "sortOrder": 0,
  "createdAt": "2026-08-27 14:20:01",
  "updatedAt": "2026-08-27 15:02:44"
}
```

The discipline that keeps these useful: **the doc holds context, the backlog
holds actions**. "Next: rotate the API key" written in prose rots — extract such
lines into backlog todos.

### Routes

Every write takes the same optional `"reason"` field as the todo routes (query
param on DELETE), and the same strict-key policy. Project and doc writes are
journaled as `project` / `project_doc` ops and show up in
`GET /api/days/:day/log` alongside todo changes. They are also
[`POST /api/apply`](#post-apiapply--one-intent-atomically) ops, which is how a
review sweep lands demotions, note appends and inbox filing as one intent.

```
GET    /api/projects            → 200 { "projects": [ ...Project ] }
GET    /api/projects?status=active
GET    /api/projects/stats      → 200 { "stats": [ ...ProjectStats ] }
POST   /api/projects            { "title", "kind"?, "outcome"?, "status"?, "targetDate"? }
                                → 201 { "project": {...} }
PATCH  /api/projects/:id        { "title"?, "kind"?, "outcome"?, "status"?, "targetDate"?, "sortOrder"? }
                                → 200 { "project": {...} }
DELETE /api/projects/:id        → 204
GET    /api/projects/:id/todos  → 200 { "backlog": [...], "scheduled": [...], "completed": [...] }
GET    /api/projects/:id/docs   → 200 { "docs": [ ...ProjectDoc ] }
POST   /api/projects/:id/docs   { "title", "body"? } → 201 { "doc": {...} }
PATCH  /api/docs/:id            { "title"?, "body"? | "append"? } → 200 { "doc": {...} }
DELETE /api/docs/:id            → 204
```

Notes that matter in practice:

- `GET /api/projects` returns everything including archived; pass `status` to
  narrow. An invalid status is a `400`.
- **`GET /api/projects/stats`** is the steering glance in one call — the numbers
  a list of projects cannot answer for itself:

  ```jsonc
  {
    "projectId": "kR2m_9xQpLs4vNbT1yWzC",
    "total": 8, "done": 3,      // every todo filed under it, open and done
    "openBacklog": 5,           // the next-action supply; 0 means it is dead
    "workedSec": 15600,         // lifetime, from todo_sessions
    "lastActivityDay": "2026-08-26",
    "nextAction": { "id": "wpHN…", "title": "wire dyd projects" },
    "isStale": false
  }
  ```

  **"Activity" means the project moved**: time banked against one of its todos,
  one of its todos finished, or a note written. Renaming it is not movement, so
  `projects.updatedAt` is deliberately not a source — counting it would clear
  the stale mark of a project nobody has touched. `isStale` is that rule applied
  against the app's day: an *active project* (never an area, never
  someday/done/archived) with no movement for 7 days, and one that has never
  moved at all counts. It is resolved server-side because a caller here has no
  day of its own — today is this API's call, as everywhere else.

  It takes no `status` filter and returns a row per project, including archived
  ones. There is no `reason` and nothing is journaled: it is derived state.
- `kind` may be changed on PATCH — promoting an area to a project (and back) is
  a real move, and the journal records it.
- **`GET /api/projects/:id/todos`** splits the project's work three ways.
  `backlog` is the *undated open* work in pull order — the **next action** is
  `backlog[0]`, and an active project with an empty backlog is effectively
  dead, which is what a weekly review looks for. `scheduled` is the dated open
  work: read-only context, so a todo does not disappear from its project the
  moment it is pulled onto a day. `completed` is what it has finished, newest
  first. Only `backlog` is a list to act on; scheduling stays a
  `PATCH /api/todos/:id` and the day is still where work happens.
- **Prefer archiving over deleting.** `status: "archived"` keeps the project's
  full history, which is the point of the archive. Deleting is available for a
  mistyped project: it **detaches** its todos (they survive, `projectId` back to
  `null`) and removes its docs, every consequence journaled.
- **`PATCH /api/docs/:id` supports `append`**, which adds one line to the body
  (`body` replaces instead). Sending both is a `400`. `append` is the ritual
  write — the evening fold's per-project worklog line, e.g.
  `{"append": "2026-08-27: finished IPC wiring; next: widget registration"}`.
  Dated appends make the worklog accumulate without anyone maintaining it.

## The day record

Each day has a record (`docs/design/assistant-behavior.md`): a **plan** — todos
penciled onto clock-time ranges — a **log** — the ops journal rendered to
natural language, `GET /api/days/:day/log` — and, once the day is closed, a
**fold**. Plans are pencil sketches: they are expected to break, and
re-planning is the normal path, not a failure state.

### The PlanEntry object

```jsonc
{
  "id": "9IKAgHE_gOid6k6FE4rzn",     // nanoid
  "day": "2026-08-24",               // the 05:00-bounded day it belongs to
  "todoId": "IMK0rtfj133dfQtUFcxxg", // the todo this block schedules
  "start": "10:00",                  // strict two-digit "HH:MM"
  "end": "14:00"
}
```

Times live on the 05:00 day: a time below `"05:00"` means the small hours of
the **next** calendar day, still belonging to `day`. The rules:

- An entry lies within one day: `end` strictly after `start` in lived order.
  The midnight wrap is fine (`23:00`–`01:00`); crossing the boundary is not
  (`04:00`–`06:00` → `400`); zero-length is not. As an `end` — and only as an
  end — `"05:00"` means end-of-day, so `03:00`–`05:00` is valid. Corollary:
  `05:00`–`05:00` is the one valid `start == end` pair and means the whole
  day, start-of-day to end-of-day.
- **Overlaps are deliberately not validated**, and there is no sort field:
  listing order is derived from `start`, 05:00 first, the small hours last.
- An entry references a real todo at creation (unknown `todoId` → `404`).
  Deleting a todo deletes its plan entries with it, journaled under the same
  reason as the todo delete.

### `GET /api/plan`

```
GET /api/plan                 → today (the app's day)
GET /api/plan?date=2026-08-24 → one day
→ 200 { "entries": [ ...PlanEntry ] }
```

### `POST /api/plan`

```
POST /api/plan
{ "todoId": "abc123", "start": "10:00", "end": "14:00", "day": "2026-08-24" }
→ 201 { "entry": {...} }
```

`day` omitted means today — planning tomorrow in the evening passes tomorrow
explicitly (ask `GET /api/today` first, never your own clock). Accepts the same
optional `"reason"` field as the todo writes; plan writes are journaled
identically. Keys outside `todoId`/`day`/`start`/`end`/`reason` are a `400` —
in particular `"date"` (the name the todo routes use): the field here is
`"day"`, and silently dropping it would plan the wrong day.

### `PATCH /api/plan/:id`

```
PATCH /api/plan/abc123
{ "start": "11:00", "end": "15:00" }
→ 200 { "entry": {...} }
```

Retiming only — `start` and/or `end`. Re-pointing a block at another todo or
moving it across days is a delete + create, which reads honestly in the log.
Accepts `"reason"`; any other key (`"todoId"`, `"day"`, ...) is a `400`, never
a silently ignored no-op.

### `DELETE /api/plan/:id`

```
DELETE /api/plan/abc123
→ 204
```

The optional reason travels as a query param, as with todo deletes:
`?reason=cancelled%20late%20block`.

### `GET /api/yesterday`

```
GET /api/yesterday
→ 200 { "date": "2026-08-22" }   // or null
```

"Yesterday" in the assistant's sense: the last day **before today with
records** (plan entries, journal ops, or pomodoro sessions) after the last
folded day — not the calendar yesterday. Gap days skip for free; `null` means
history is fully folded (or empty). Use it to find which day a morning fold
should close.

### `GET /api/days/:day`

```
GET /api/days/2026-08-24
→ 200 { "day": "2026-08-24", "plan": [ ...PlanEntry ], "fold": {...} | null }
```

The whole day record in one read. `fold` is `null` until the day is folded.
The log is deliberately not inlined here — it is drill-down, not default
context; read it separately.

### `GET /api/days/:day/log`

```
GET /api/days/2026-08-24/log
→ 200 { "day": "2026-08-24", "lines": [
    { "seq": 41, "at": "2026-08-23T20:57:11.302Z", "time": "05:57",
      "source": "user", "text": "added \"Write tests\"" },
    { "seq": 45, "at": "2026-08-24T02:03:10.114Z", "time": "11:03",
      "source": "agent", "reason": "Front-load the migration work",
      "text": "Front-load the migration work: added \"Write migration\", planned \"Write migration\" 13:00-15:00" }
  ] }
```

The day's journal (`ops` + `reasons`), rendered to natural language at read
time — nothing is stored rendered. Read-only; there is no way to write a log
line directly, and none is planned.

- The window is over when the ops **happened** (the 05:00 day of their
  timestamps), not the days they touch: re-planning tomorrow tonight logs
  today, with the entry's own day named in the sentence (`... on 2026-08-26`).
- `time` is the wall clock (Asia/Seoul, "HH:MM") of `at`, which stays raw ISO.
- Consecutive ops written under one reason collapse into **one line**: the
  reason text, a colon, then the mechanical summary. `reason` is present on
  exactly those lines; `text` is always self-contained, so printing
  `lines[].text` alone reads correctly.
- Unreasoned ops (all direct UI edits — `source: "user"` never carries a
  reason) render mechanically, one line per op, showing only changed fields.
  Exception: deleting a todo sweeps its plan entries in the same transaction,
  and those sweep ops fold into the delete's line
  (`deleted "T" (2 planned blocks removed)`).
- `seq` (and `at`/`time`/`source`) come from the group's **first** op — the
  future rewind anchor, "state before this line".
- What never appears: reorders (not journaled — cosmetic), folds (not
  journaled — derived state), and pomodoro work accrual (`workedSec` changes
  outside the journal). A day can therefore have sessions but an empty log.
- Plan lines resolve todo titles at read time: a live todo shows its
  **current** title (a later rename retro-titles older lines — accepted;
  precision is not the contract); a deleted todo's title comes from its last
  journal snapshot.

### `POST /api/days/:day/fold`

```
POST /api/days/2026-08-24/fold
{ "remarks": "good first day" }
→ 200 { "fold": { "day", "snapshot", "remarks", "foldedAt" } }
```

Folding closes a day: the **snapshot** — the final plan, each involved todo's
outcome (`{ id, title, done, completedOn, workedSec, projectId }`), and the
projects the day moved (`{ id, title, workedSec, doneCount }`) — is computed
app-side, deterministically; only `remarks` comes from the caller. Involved
means planned into, dated on, completed on, or worked on that day. `workedSec`
in the snapshot is the seconds accrued **on that day** (sessions starting
within it), not the todo's lifetime rollup.

`snapshot.projects` is the evening ritual's input
(`docs/design/projects-para.md`): a project appears only if the day actually
**moved** it — time banked against one of its todos, or one of its todos
completed on that day. A todo merely dated on the day puts no project there.
So the fold response alone names the projects worth appending a worklog line
to, via `PATCH /api/docs/:id { "append": ... }`.

The snapshot carries `"v"`. It is `2` today; folds written before project
attribution existed are still stored as `v: 1` and have neither
`todos[].projectId` nor `projects` — re-folding such a day upgrades it. There
is no migration: a snapshot is derived state.

Semantics worth internalizing:

- **Re-folding is the normal path**, not an error: fold at night, then let the
  next morning's conversation fold again — the snapshot is recomputed and
  `foldedAt` restamped. A fold is a record, not a lock: later writes to the day
  simply leave it stale until the next fold.
- `remarks` follows patch semantics: omitted (or an empty body) **keeps** the
  existing remarks, `null` clears them, a string replaces them. A blank string
  is a `400` — pass `null` to clear.
- Folding a future day is a `400`. Folding a day with no records at all (no
  plan, no involved todos, no journal ops) is a `400` — empty days stay empty.
- Folds take no `"reason"` and are not journaled; the snapshot is derived
  state, and `remarks` is the natural-language payload.

## `POST /api/apply` — one intent, atomically

The assistant's write path (`docs/design/assistant-architecture.md`): one
natural-language **reason** plus every op it explains, applied as a single
transaction and journaled as one intent — the log renders the whole batch as
one line. The single-op routes above stay the right tool for a lone quick
edit; this route exists so a multi-op intent (splitting a todo, laying out a
morning plan) never scatters across reasons.

```jsonc
POST /api/apply
{
  "reason": "split C into C-1 and C-2",  // required, non-empty
  "sessionId": "cc-0142",                // optional, client-generated, journaled
  "ops": [
    { "op": "todo.create", "title": "C-1" },
    { "op": "todo.create", "title": "C-2" },
    { "op": "todo.delete", "id": "abc123" },
    { "op": "plan.create", "todoId": "$0", "start": "10:00", "end": "12:00" }
  ]
}
→ 200 { "reasonId": "wUzT…", "results": [
    { "todo": {...} }, { "todo": {...} }, { "deleted": "abc123" }, { "entry": {...} }
  ] }
```

A weekly review is the same shape one layer up — a demotion, a worklog line and
an inbox item filed, all under one reason, all or nothing:

```jsonc
POST /api/apply
{
  "reason": "weekly review: park the ingest rewrite, file the key rotation",
  "ops": [
    { "op": "project.update", "id": "kR2m…", "status": "someday" },
    { "op": "project_doc.update", "id": "b7Xq…",
      "append": "2026-08-28: parked; the import benchmark never happened" },
    { "op": "todo.update", "id": "wpHN…", "projectId": "sQ4p…" }
  ]
}
```

- **Op kinds** — `todo.create`, `todo.update`, `todo.delete`, `plan.create`,
  `plan.update`, `plan.delete`, `project.create`, `project.update`,
  `project.delete`, `project_doc.create`, `project_doc.update`,
  `project_doc.delete`. Each carries exactly the fields of its
  single-op route (minus `reason`, which lives at the top level): updates
  take `id` plus at least one patch field, deletes take `id` alone, creates
  take the create body. `project_doc.create` additionally takes `projectId`,
  which its single-op route reads from the path. Unknown op kinds and unknown
  keys are a `400`, as everywhere.
- **`"$N"` references** — anywhere an op names an id (`id`, `todoId`,
  `projectId`), the string `"$N"` means "the entity created by `ops[N]`"
  earlier in the same batch. The target must be an earlier `*.create` of the
  right entity; forward/self references, refs to non-creates, and malformed
  `$…` strings are a `400` (a real nanoid can never start with `$`). This is
  what lets a split stay one intent.
- **A new project's `notes` doc is not `"$N"`-addressable.** `project.create`
  mints the project, and the default doc it creates alongside (journaled as a
  second op under the same reason) has an id the batch never sees. Write that
  first note afterwards, through `GET /api/projects/:id/docs` +
  `PATCH /api/docs/:id` or `dyd projects note`. `project_doc.create` is for a
  genuinely additional doc.
- **Atomicity** — ops run in order inside one transaction; any failure
  (validation, unknown id) rolls back the entire batch, reason row included,
  and returns that op's `400`/`404`. `results` mirrors `ops` by index:
  creates and updates return the written object (`{ "todo" }`, `{ "entry" }`,
  `{ "project" }`, `{ "doc" }`), deletes return `{ "deleted": "<id>" }`.
- **Journal** — one `reasons` row (`source: "assistant"`, the `sessionId` if
  given), every op stamped with one shared `at`, so the day log collapses the
  batch into a single `[assistant]` line. `reasonId` is `null` when nothing
  journaled (every op was a no-change patch).
- At most **100 ops** per batch — a batch is one intent, not a bulk importer.
- Folding is not an op; it stays `POST /api/days/:day/fold` (folds are not
  journaled).

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
| `400` | Bad input — malformed date, empty title, non-JSON body, an unknown key in a write body (every write surface is strict, and they share one allowlist), empty or non-string `reason` (`null` counts as absent), activating a completed todo, a plan time that is not strict "HH:MM", an entry whose end does not come after its start within the 05:00 day, folding a future or empty day, blank remarks, a batch with a missing reason / empty `ops` / more than 100 ops / an unknown op kind / a bad `"$N"` reference |
| `401` | Missing or invalid bearer token |
| `404` | Unknown todo, plan-entry, project or project-doc id, or unknown route |
| `405` | Route exists, wrong method |
| `500` | Internal error (details are logged app-side, not returned) |

## Live UI updates

Every write — todo, plan, or fold, from the app or from this API — broadcasts a `todos:changed` event to the renderer, which reloads after a short debounce (50 ms). Plan writes carry reason `"plan"` (with the plan-entry id) and folds carry `"fold"`; the day-sheet widget is their reader (`docs/design/assistant-architecture.md`, step 6). An open dashboard picks up an agent's change without user interaction. Nothing extra to call. A batch (`POST /api/apply`) buffers its events and broadcasts them only after the whole batch commits — a rolled-back batch announces nothing.

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
