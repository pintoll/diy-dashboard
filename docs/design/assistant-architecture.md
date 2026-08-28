# In-App Assistant: Architecture

Architecture decisions for the assistant, fixed 2026-08-24 and revised
2026-08-26 (the Claude Code pivot, see "The brain" below). Companion to
`assistant-behavior.md` (the behavior contract). Results only, deliberation
omitted.

Status: **phases 1 (the 05:00 day boundary), 2 (the journal), 3 (the day
record's plan and fold services), 4 (the log view), 5 (the analytics day
boundary), 6 (the day-sheet widget), 7 (the batch apply route + dyd verbs),
and 8 (the secretary workspace) implemented; 9 (rewind) deferred.**

## Data layer

- Choke point already exists: `src/main/todos/crud.ts` serves both the widget
  IPC (source `user`) and the agent API (source `agent`). The assistant is the
  third source, `assistant`, writing through the agent API's batch route
  (`POST /api/apply` → `src/main/todos/apply.ts`): one required reason plus
  the ops it explains, applied atomically through those same functions, with
  `"$N"` references so a multi-op intent (a split) stays one reason. The op
  set grew with the layers built on this one: `todo.*`, `plan.*`, `project.*`
  and `project_doc.*` (`docs/spec/todos-agent-api.md`), and `"$N"` resolves in
  a todo's `projectId` as well as a doc op's, so "open the project and file its
  first actions" stays a single reason.
- Two new concepts, both in todos.db (the journal must be written inside crud
  transactions):
  - `reasons`: one row per intent — id, source (`assistant`|`agent`),
    session_id (assistant only), text (one NL line), created_at. Created
    before the ops it explains; many ops reference one reason.
  - `ops`: unified append-only journal of every steering and execution
    change — todo, plan, and (since the projects layer) project and
    project_doc — as one time-ordered stream: seq, entity
    (`todo`|`plan`|`project`|`project_doc`), entity_id, op
    (`create`|`update`|`delete`), before/after (full row snapshots as JSON),
    source, reason_id (nullable), at.
- The behavior contract's "log" is a **derived view** over `ops` + `reasons`,
  rendered to natural language at read time. Reasoned ops collapse into one
  line per reason; unreasoned (direct UI) ops render mechanically. This bends
  the contract's letter (NL at render time, not storage time) while keeping
  its intent: zero user chore, model-agnostic.
- Journal rules: no FK from `ops` (history survives deletion); `reorder` is
  not journaled (cosmetic); deleting a todo removes its plan entries
  explicitly in the service layer, not via cascade, so the removal is
  journaled too.
- Todo op vocabulary stays minimal. Splitting/merging todos = add/delete
  combos under one reason; no new operations.
- dyd / agent API take a per-command `--reason` (one reason per call) for the
  quick lane. Grouping many ops under one reason — deferred at design time —
  is the batch route (`dyd apply`); per-call reason ids never happened.

## Day boundary: 05:00 app-wide

The contract's 05:00–05:00 day is adopted by the **whole app**, not just the
assistant. One definition of "today" everywhere; late-night work no longer flips
the widget list, lands `completed_on` on the next day, or pushes open todos into
Overdue at midnight. No data migration — only boundary behavior changes.

Implemented as `src/shared/day.ts` (`dayOf(now)` / `today()`), imported by both
processes. The two hand-copied `kstToday()` helpers it replaces are gone: main
and the renderer could otherwise drift apart on which day the app is on, the
same duplication `@shared/pomodoro-time` exists to prevent. Reached: todo
dates, `completed_on` stamping, backlog un-park target (crud and desk), the
Overdue query, `todos:list` defaults, the agent API's date defaults, and every
renderer "is this today" check.

Two neighbours deliberately keep calendar days. daily-news has its own kst
helper (news is published against calendar dates). finance's `currentYm` is
month-grained, where a 04:00 timestamp on the 1st belongs to the new month.

Pomodoro analytics now shares the boundary too (step 5).
`entities/pomodoro-session/model/aggregations.ts` originally never used the KST
helper — its private primitives read machine-local midnight — so a todo
finished at 02:00 stamped `completed_on` on the previous day while the same
instant's pomodoro session landed on the next one in the heatmap and streak.
Those primitives are gone: every day bucket routes through `dayOf`, the week
windows through `weekStartOf` (Monday 05:00 KST, `@shared/day`'s
`addDays`/`daysBetween`/`weekStartOf` key arithmetic), and the time-of-day
buckets through `hourOf` (Seoul wall clock, not machine-local). Attribution is
unchanged: day counts still key on `endedAt`, the hour pattern on `startedAt`,
and fold's `started_at` rule stays its own. The stat widgets also roll over at
05:00 now (`renderer/shared/lib/use-today.ts`) instead of waiting for the next
session write.

## Schema (todos.db)

```sql
reasons (
  id         TEXT PRIMARY KEY,
  source     TEXT NOT NULL,        -- 'assistant' | 'agent'
  session_id TEXT,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
ops (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  entity     TEXT NOT NULL,        -- 'todo' | 'plan' | 'project' | 'project_doc'
  entity_id  TEXT NOT NULL,        -- deliberately no FK
  op         TEXT NOT NULL,        -- 'create' | 'update' | 'delete'
  before     TEXT,                 -- row JSON; NULL on create
  after      TEXT,                 -- row JSON; NULL on delete
  source     TEXT NOT NULL,        -- 'user' | 'agent' | 'assistant'
  reason_id  TEXT,
  at         TEXT NOT NULL
);
plan_entries (
  id      TEXT PRIMARY KEY,
  day     TEXT NOT NULL,           -- 05:00-boundary date
  todo_id TEXT NOT NULL,
  start   TEXT NOT NULL,           -- "HH:MM"; < "05:00" = small hours of next calendar day
  end     TEXT NOT NULL
);
day_folds (
  day       TEXT PRIMARY KEY,
  snapshot  TEXT NOT NULL,         -- computed: final plan + done/worked outcomes
  remarks   TEXT,                  -- NL, from the closing/morning conversation
  folded_at TEXT NOT NULL
);
```

- `day_folds.snapshot` is computed deterministically by code at fold time
  ("log applied onto plan" needs no model); only `remarks` comes from
  conversation.
- "Yesterday" resolver: last day with ops or plan entries after
  `max(day_folds.day)` — gap days skip for free.
- The `entity` CHECK is not fixed at two values: schema migration 6 rebuilt it
  to admit `'project'` and `'project_doc'` when the projects layer landed
  (`projects-para.md`), so project and doc writes get this journal, the log
  view and `/api/apply`'s reason for free. A later entity pays the same
  table-rebuild price — SQLite cannot ALTER a CHECK.

## Sessions & rewind

- A session is a Claude Code conversation in the secretary workspace — the
  app keeps no session state, no table, and no write-lock. The workspace's
  SessionStart hook hands the conversation a session id; every `apply`
  carries it into `reasons.session_id`, so the journal can still group a
  conversation's intents after the fact.
- Concurrency is unmanaged by design: one user, and a widget-vs-assistant
  race resolves through the journal (both writes journaled, last wins). A
  long or resumed conversation is instructed to re-read before writing
  (workspace CLAUDE.md); nothing enforces it app-side.
- Rewind is **deferred** (step 9). Until it hurts, reverting is explicit:
  the assistant issues compensating ops in a new `apply` under a
  "revert: ..." reason — an honest journaled change, not an unwind. If an
  inverse replay is ever built, the old rule stands: invert only the fields
  where before and after differ, never restore the whole before snapshot
  (`worked_sec` accrues via `recordWork` outside the journal, so a whole-row
  restore would clobber time banked since the op).
- Conversation-side rewind belongs to Claude Code natively. There is no
  atomic conversation+state rewind; the behavior contract was amended
  accordingly.

## The brain: Claude Code (pivot, 2026-08-26)

The original design embedded a LangGraph JS loop with a Gemini provider in
the main process. Before implementation it was replaced by Claude Code acting
as the assistant from a dedicated workspace (`~/secretary`),
talking to the app through `dyd` over the agent API. Phases 1-6 carried over
untouched — they never contained model code.

- The workspace directory IS the assistant boundary:
  - `CLAUDE.md` — the distilled behavior contract (identity, day model, tool
    rules): the role the in-app system prompt would have played.
  - A SessionStart hook loads the distilled triple (yesterday's result,
    today's plan, today's log so far) plus the session id into context before
    the first word — the contract's "context is injected, not fetched", now a
    harness guarantee that also covers `--resume`.
  - `.claude/settings.json` allowlists `dyd` there and nowhere else, which is
    what makes "changes apply immediately during conversation, no
    per-operation approval step" true without loosening any other directory.
  - Project memory is workspace-scoped: durable user patterns may persist
    there; day facts stay in day records.
- The original three tools map onto the API surface one to one:
  `apply_changes` → `POST /api/apply` (`dyd apply`); `read_day` →
  `GET /api/days/:day` + `/log` (`dyd day`, `dyd log`); `fold_day` →
  `POST /api/days/:day/fold` (`dyd fold`).
- The quick lane stays: outside the workspace, single-op writes with (or
  without) `--reason` remain ordinary `agent`-source edits. Entering a
  secretary conversation is what upgrades writes to reasoned batches.

## Provider

None. The model is whatever runs the user's Claude Code; the journal and the
API do not care — the contract's "models swappable behind an adapter", taken
to its limit. No assistant API key or base URL is stored in the app, and the
LangChain base-URL gate the original design carried is moot.

## Surface

- Chat lives in a **terminal**: a Claude Code session opened in the secretary
  workspace. There is no second BrowserWindow, no route, no global shortcut,
  and the plan widget ships no chat button — reconsider a widget affordance
  only if opening the terminal proves to be real friction.
- The paired widget renders today's plan as **one memo-like block** — the day
  on a single sheet: one line per plan entry (start–end, todo title, done),
  sorted by start time, a current-time marker, and a small "yesterday
  unfolded" hint when the morning fold is pending. Empty day = blank sheet
  inviting a planning chat. It replaces the user's previous notepad habit;
  unlike a notepad, lines reference real todos, so checking is recording.
- Widget edits are deliberately shallow: inline time change (the most common
  edit), done toggle, remove line, add a line by picking one of today's
  todos. Each is an ordinary journaled op with no reason. Anything structural
  (splitting, moving across days) belongs to the chat or the todo widget.
  Start-time ordering is automatic; overlaps are not validated (pencil
  sketch).
- The fold snapshot is essentially this block's end-of-day state — the widget
  is the visible face of the day record.

## Implementation order

1. **05:00 day boundary** — `@shared/day`, app-wide. *(done)*
2. **Journal** — `reasons` + `ops` tables, written inside crud transactions.
   Needs `todos.source` rebuilt to admit `'assistant'` (SQLite cannot ALTER a
   CHECK), and `createTodo`/`deleteTodo` wrapped in transactions — today only
   `updateTodo` has one. *(done — src/main/todos/journal.ts; also journals the
   desk un-park, skips no-change updates, and adds `--reason` to dyd and the
   agent API)*
3. **`plan_entries` + `day_folds`** — the day record's plan and fold services.
   *(done — src/main/todos/plan.ts, fold.ts, day-snapshot.ts (pure snapshot
   builder) and @shared/plan-time (05:00-anchored "HH:MM" ordering/validation);
   agent API /api/plan, /api/days/:day(+/fold), /api/yesterday; deleteTodo now
   sweeps plan entries through the journal instead of a cascade)*
4. **Log view** — `ops` + `reasons` rendered to natural language at read time.
   *(done — src/main/todos/log-render.ts (pure renderer: reason collapse,
   delete-sweep fusion, changed-fields grammar) + log.ts (day-window query,
   title resolution); `GET /api/days/:day/log`; `dyd log`)*
5. **Analytics day boundary** — fold `aggregations.ts` onto the same day
   definition (see above), before the day model becomes visible in step 6.
   *(done — day/week/hour buckets rebased on @shared/day (`addDays`,
   `daysBetween`, `weekStartOf`, `hourOf` added there); DailyTrendChart's
   private midnight copy removed; stat widgets roll over at 05:00 via
   renderer/shared/lib/use-today.ts)*
6. **Day-sheet widget** — today's plan as one block, with the shallow edits.
   *(done — src/renderer/src/widgets/day-sheet (sheet-lines.ts/plan-time-input.ts
   pure render/parse logic) over a plan store in entities/todo; new IPC
   `todos:plan:*`, `todos:yesterday`, `todos:by-ids`; plan and fold writes now
   broadcast `todos:changed` with reasons `"plan"`/`"fold"`. The chat button
   was dropped by the step-7 pivot; the yesterday hint is display-only)*
7. **Batch apply + dyd verbs** — the assistant's write path: `POST /api/apply`
   (one reason + ops, `"$N"` refs, atomic, buffered `todos:changed`), plus
   `GET /api/todos/by-ids` and the dyd verbs `apply` / `day` / `yesterday` /
   `fold`. *(done — src/main/todos/apply-ops.ts (pure parser, unit-tested) +
   apply.ts (outer transaction over the same crud/plan functions, whose inner
   transactions become savepoints) + events.ts emit buffering;
   docs/spec/todos-agent-api.md and dyd-cli.md updated)*
8. **Secretary workspace** — `~/secretary`: CLAUDE.md (the
   distilled contract), SessionStart hook (loads the triple + session id),
   `dyd` allowlist. Outside this repo by design — the workspace is user
   configuration, not app code, which is also why it sits beside `~/workspace`
   rather than inside it. *(done — and later taught the projects layer: a
   `## Projects` section, the three review rituals, and an active-projects
   block in the SessionStart hook, so the steering layer arrives in context
   with the day triple)*
9. **Rewind** — deferred until compensating ops (see Sessions & rewind) hurt.

Steps 1–7 carry no model code: the day record, its journal, and the batch
route are ordinary app features, usable on their own (`dyd` is a complete
manual client). The model arrives with step 8's workspace on top of a journal
already exercised by hand, so a bad plan line is never ambiguous between a
tool bug and a prompt bug.

## Open at implementation time

- Rewind (step 9): compensating ops until real inverse replay hurts enough.
- A widget-side affordance for opening the chat: dropped with the second
  window; revisit only on real friction.
- Widget visual design (layout above is fixed; styling at implementation).
