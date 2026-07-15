# Multi-Todo Pomodoro Attribution ("the desk")

Lets a single pomodoro session credit **several todos at once**, and credits each
one **incrementally** as work happens instead of only when the timer fully stops.

Status: **phases 1-2 implemented** (data + accrual core, desk UI). Branch
`feature/multi-pomo-todo`. Supersedes the single active-todo model wherever the
two conflict. Phases 3-4 (bridge/dyd/specs, session-record `todoIds`) remain.

## Why

Today's model has two hard limits, both rooted in the same assumption — *one
pomodoro belongs to exactly one todo, decided at the last instant*:

1. **One active todo.** `active_todo` is a single row (`src/main/todos/db.ts:43`,
   `CHECK (id = 1)`). `setActiveTodo` overwrites it (`todos/active.ts:25`).
2. **Credit only at session end.** Every accrual path snapshots
   `useTodoStore.getState().activeTodoId` at the boundary and banks the whole
   block (`durationSec + overtimeSec`) onto that one todo:
   `recordCompletedWorkSession` (`use-pomodoro-store.ts:69`), `confirmReview`
   (`:579`), `stop` (`:387`), `skip` (`:440`). Switching the active todo
   mid-session does nothing — whoever is active at the end eats the full 25 min.

The user's real workflow is agent-centric: several branches supervised in
parallel inside one focus block. The question they want answered is not "what
share of my attention did task X get" but **"how long did task X take"** — wall
time the task was in flight. Two tasks worked in the same 25 minutes should each
read 25 minutes, not 12.5.

### The reframe: nothing owns anything

The discomfort with "todo owns pomo" (or the reverse) dissolves once a third
concept is named:

> **The pomodoro is a clock.** Todos are work items. The **desk** is the set of
> todos currently receiving that clock. Membership on the desk, not ownership,
> is what routes time. A todo completing just steps off the desk; the clock
> keeps running for the rest.

"Desk" is already the project's word for this surface — the `dyd` CLI calls its
overview "the state of your desk" (`docs/spec/dyd-cli.md:42`). Completion (`done`)
and time-accrual (`worked_sec`) are **already independent** in the schema
(`accrueTodoWork` never touches `done`); this design only removes the last knot
tying them together (the single end-of-session snapshot).

## The model: "in-flight" attribution (no division)

- The **desk** is a *set* of active todos.
- While a **work** pomodoro runs, **every** todo on the desk accrues wall-clock
  time. Time is **not divided** across desk members — each independently gets the
  full overlap. Three on the desk through a 25-min block → each banks 25 min.
- `worked_sec` therefore means: **focused-clock wall time this task was in
  flight, summed across pomodoros.** It answers "how long did it take," not
  "what fraction of my focus." Accrual is gated on a running work pomo, so a todo
  left on the desk overnight banks nothing.

### The one consequence to accept

`sum(worked_sec)` across todos **can exceed** the session's — or the day's —
wall-clock time, by design. "How much did this task take" (per-todo, overlaps
allowed) and "how much did I actually focus today" (per-day, no overlap) become
**two different, both-correct numbers**. Any figure that must not double-count
overlap (e.g. a day total) has to come from the **session log** (`pomodoro.db`),
never from summing the per-todo `worked_sec` rollup.

## Data model

Two independent records link a pomodoro to its todos today; both go plural.

### 1. The desk (todos.db) — was `active_todo`

Single-row `active_todo` → a membership set. Minimal change: drop the
`CHECK (id = 1)` and let the table hold N rows, or introduce a `desk` table:

```sql
CREATE TABLE desk (
  todo_id      TEXT PRIMARY KEY REFERENCES todos(id) ON DELETE CASCADE,
  joined_at    TEXT NOT NULL
);
```

`getActiveTodo`/`setActiveTodo` (`todos/active.ts`) become
`getDesk(): Todo[]` / `addToDesk(id)` / `removeFromDesk(id)` / `clearDesk()`.
`joined_at` is retained per member — it clamps the start of that member's
in-flight interval (see mechanics). The `done`-guard on activation
(`active.ts:40`) carries over: a completed todo cannot be added to the desk.

### 2. The attribution ledger (todos.db) — `todo_sessions`

`todo_sessions` already stores one row per (session, todo) with its own
`worked_sec`, and `todos.worked_sec` is the additive rollup (`sessions.ts:40`).
Today its PK is `session_id`, so a session can appear once. Change: a session can
now produce **multiple** rows (one per in-flight interval, across desk members),
so key on a renderer-generated surrogate and keep the rollup additive:

```sql
CREATE TABLE todo_sessions (
  attribution_id TEXT PRIMARY KEY,   -- stable per interval, renderer-generated
  session_id     TEXT NOT NULL,      -- no longer unique
  todo_id        TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  started_at     INTEGER NOT NULL,
  ended_at       INTEGER NOT NULL,
  worked_sec     INTEGER NOT NULL,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

`recordWork` stays **idempotent**: `INSERT OR IGNORE` on `attribution_id`, bump
`todos.worked_sec` only when the row is actually inserted (unchanged logic,
`sessions.ts:29-45`), so a retried IPC/HTTP call still can't double-count. Each
in-flight interval is one attribution event with a stable id
(`${sessionId}:${todoId}:${seq}`); a todo that leaves and rejoins the desk within
one session yields two rows, which is correct.

### 3. The session record (pomodoro.db) — `todoId` → `todoIds`

`PomodoroSessionRecord.todoId: string | null`
(`entities/pomodoro-session/model/pomodoro-session.types.ts:69`;
`src/main/pomodoro/types.ts:24`, `sessions.ts`) becomes
`todoIds: string[]` — the union of todos that were on the desk at any point in
the session. This is the renderer-side "celebration" log's link, used by the
future day drill-down ("this session: worked on A, B, C"). Migration:
`todoId` present → `[todoId]`, `null` → `[]`. Analytics does not read this field
today (see below), so the change is forward-compat only; wiring it into the
drill-down UI is out of scope for the first cut.

## Attribution mechanics

The renderer pomo store owns interval boundaries (it owns the clock). Each desk
member has an **open interval** whose start is `max(joined_at, workBlockStart)`.
An interval **closes and banks** (one `recordWork` call) on any of:

| Trigger | What banks |
|---|---|
| Todo marked `done` | that member's open interval, then it leaves the desk |
| Removed from desk | that member's open interval |
| Session end — phase complete, `stop`, `skip`, overtime end | **all** still-open members' intervals |
| Pause | all open intervals close; resume opens fresh ones |

- **Block time** is wall-clock overlap with the running work phase.
- **Overtime** is added per member present during overtime, using the
  **idle-excluded** `accumulatedSec` (`pollIdle`, `use-pomodoro-store.ts:508`) —
  same idle rule as today's single-todo overtime. Block = wall time, overtime =
  idle-excluded, matching the existing asymmetry.
- **Phase end while a todo is unfinished** is a non-event: its open interval
  flushes, the partial time banks, the todo stays open and re-accrues on the next
  pomo. This is the whole point of interval-based banking.

## Bridge / dyd / remote contract

`PomodoroApiState.activeTodo: { id, title } | null`
(`agent-api/pomodoro-bridge.ts:62`, enriched in `toApiState` at `:97`) →
`desk: { id, title }[]`. Consumers:

- **`GET /api/pomodoro`** returns `desk` array. Keep `activeTodo` as a
  deprecated alias = `desk[0] ?? null` for one release so existing `dyd` keeps
  working.
- **`POST /api/active-todo`** (`dyd todo use`, `dyd-cli.md:97`) → add/remove/clear
  desk semantics. `dyd todo use <n>` adds; a new `dyd todo drop <n>` removes;
  `dyd todo use -` clears. The `*` marker in `dyd`'s overview
  (`dyd-cli.md:53`) marks every desk member.
- **Remote web view** (Tailscale read view) shows the desk as a list, not a
  single "Working" line.

Specs to update: `docs/spec/pomodoro-agent-api.md`, `docs/spec/dyd-cli.md`,
`docs/spec/todos-agent-api.md`.

## Desk UI

- **`TodoRow`** (`features/manage-todo/ui/TodoRow.tsx:33`): the Play/Square toggle
  becomes add-to-desk / remove-from-desk. Multiple rows can show the on-desk
  highlight (`bg-primary/10`) simultaneously. `worked_sec` display (`:76`) is
  unchanged — it just may now sum past the day's clock, which is intended.
- **`TodoTodayClient`** (`widgets/todo-today/ui/TodoTodayClient.tsx:47`): the
  single "Working / Up next" card becomes a **desk section** listing all members;
  the ping animation (`sessionActive`) plays on the group. "Up next" wording only
  applies when no work pomo is running.

## Analytics — insulated

The focus-analytics page aggregates strictly **by session** (attention, intent,
time-of-day, app buckets); it never sums per-todo `worked_sec` and, confirmed,
never reads `todoId` (`docs/design/focus-analytics.md`). So overlap-driven
double counting **cannot** reach any existing chart. The only todo-facing number
is `TodoRow`'s per-task `worked_sec`, whose new "sum may exceed wall-time"
semantic is the desired behavior. If a future view wants "total focused time
today," it derives it from the session log, not the todo rollup.

## Design decisions

- **No division.** Desk members each get the full overlap. `worked_sec` is a
  duration measurement, not an effort allocation. This is the user's explicit
  ask and keeps every ledger row a real fact.
- **Accrual gated on a running work pomo.** Desk membership alone accrues
  nothing; the clock must be running. Keeps parity with today (only work phases
  ever accrued) and stops idle desk membership from inflating time.
- **Idempotent ledger preserved** via surrogate `attribution_id` + additive
  rollup — the retried-write safety of the current `session_id` PK is kept.
- **Completion and accrual stay orthogonal.** Marking done banks the open
  interval and leaves the desk; it does not require or imply a full block.

## Decisions (locked 2026-07-15)

Adopted the recommended defaults; no counter-proposal raised.

1. **Desk persists** across breaks and across pomodoros — it clears only when a
   member is removed or completed. Rationale: juggling the same set of tasks over
   several pomos is the target workflow; clearing per session would just add
   re-selection clicks. *This is the one real fork — revisit if desk staleness
   (forgotten members silently accruing) turns out to bite in use.*
2. **Session-record `todoIds` migrated to plural now**, but the drill-down UI
   that surfaces it is deferred (out of scope for the first cut).
3. **`activeTodo` compat alias kept** — the agent API returns
   `activeTodo = desk[0] ?? null` alongside `desk[]` for one release so
   un-updated `dyd` installs keep working.
4. **No desk size cap** (soft — personal single-user tool).

## Migrating existing data

There is no migration framework (`db.ts` DDL is idempotent, run on every open),
so the schema changes below are hand-managed. The user has a live `todos.db`
with accrued `worked_sec`, so phase 1 must migrate, not reset:

- **`todo_sessions` PK change** (`session_id` → `attribution_id`): SQLite can't
  rename a primary key in place. Rebuild — create the new table, copy each old
  row with `attribution_id = ${session_id}:${todo_id}:0`, drop the old, rename.
  Guard it so it runs once (e.g. detect the old schema via `PRAGMA table_info`).
- **`todos.worked_sec` rollup** is already correct and is **not** recomputed —
  the copied attribution rows already sum to it.
- **`active_todo` → `desk`**: seed the desk from the single `active_todo` row
  (one member, or empty if none), then drop `active_todo`.

## Rollout / phasing

1. **Data + accrual core.** ✅ **Done.** `desk` table + `todo_sessions` surrogate
   `attribution_id` (rebuild migration, `worked_sec` preserved) + interval-based
   `recordWork`; pomo store banks per interval over the desk via the pure engine
   in `widgets/pomodoro-timer/model/desk-attribution.ts`, driven by
   `DeskAttributionController`. `active_todo` → `desk` with single-active compat
   wrappers kept (`todos/active.ts`) so IPC + agent API are untouched this phase.
   The overlap math is unit-tested (`desk-attribution.test.ts`) and the store
   glue is integration-tested (`use-pomodoro-store.integration.test.ts`):
   join mid-block, complete mid-block, pause, overtime, leave+rejoin.
2. **Desk UI.** ✅ **Done.** Renderer `todos:desk:*` IPC + preload bridge expose
   the desk primitives; `useTodoStore` holds `desk: Todo[]` (replacing the single
   `activeTodo`/`activeTodoId`). `TodoRow`'s Play/Square toggle is now
   add/remove-from-desk with a per-row on-desk highlight; `TodoTodayClient`'s
   single card is a desk section listing all members with the ping on the group.
   The pomo store's `deskMembers()` reads the full set (session-log `todoId`
   still the primary member until phase 4) and `DeskAttributionController` keys
   on desk membership. `active_todo` IPC + agent API left as compat for phase 3.
   Two multi-member integration tests added.
3. **Bridge + dyd + remote + specs.** Plural `desk`, compat alias, spec updates.
4. **Session-record `todoIds` migration** (+ drill-down display, optional).
</content>
</invoke>
