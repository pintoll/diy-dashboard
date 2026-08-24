# In-App Assistant: Architecture

Architecture decisions for the in-app assistant, fixed 2026-08-24. Companion to
`assistant-behavior.md` (the behavior contract). Results only, deliberation
omitted.

Status: **designed; phases 1 (the 05:00 day boundary), 2 (the journal), and 3
(the day record's plan and fold services) implemented.**

## Data layer

- Choke point already exists: `src/main/todos/crud.ts` serves both the widget
  IPC (source `user`) and the agent API (source `agent`). The assistant becomes
  a third source, `assistant`, calling the same functions in-process (no HTTP).
- Two new concepts, both in todos.db (the journal must be written inside crud
  transactions):
  - `reasons`: one row per intent — id, source (`assistant`|`agent`),
    session_id (assistant only), text (one NL line), created_at. Created
    before the ops it explains; many ops reference one reason.
  - `ops`: unified append-only journal of todo **and** plan changes, one
    time-ordered stream — seq, entity (`todo`|`plan`), entity_id, op
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
- dyd / agent API take a per-command `--reason` (one reason per call). Reason
  ids for grouping multiple calls: deferred until it hurts.

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

**Not** reached: pomodoro analytics. `entities/pomodoro-session/model/aggregations.ts`
never used the KST helper — `toDateKey`, `startOfLocalDay`, `startOfIsoWeek`,
and the hour buckets all read machine-local midnight — so the cutoff does not
propagate there. Until that is redone, a todo finished at 02:00 stamps
`completed_on` on the previous day while the same instant's pomodoro session
lands on the next one in the heatmap and streak. Accepted interim state;
scheduled before the day sheet puts the day model on screen (see below).

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
  entity     TEXT NOT NULL,        -- 'todo' | 'plan'
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

## Sessions & rewind

- Sessions are in-memory in the main process, disposable, no table. A single
  write-lock: one live session at a time (multiple sequential sessions per day
  allowed).
- Rewind is session-scoped and journal-based: each `apply_changes` call is one
  reason = one conversation anchor; rewinding to an anchor inverts that
  session's later ops in reverse order (before-snapshots are the inverse data).
  Modes per the contract: conversation only, state only, or both. No separate
  undo stack.
- Inverting an op must apply only the fields where before and after differ,
  never restore the whole before snapshot: `worked_sec` accrues via
  `recordWork` outside the journal (a mechanical rollup of `todo_sessions`,
  not an intent), so a whole-row restore would clobber time banked since the
  op.

## Inner agent

- LangGraph JS (`@langchain/langgraph`) in the main process, with three
  guardrails that keep it removable:
  1. **No checkpointer.** Sessions stay disposable; rewind stays on the ops
     journal. LangGraph persistence/time-travel is never used.
  2. **Graph stays `llmCall <-> toolNode`.** Growth only if backlog items
     (PARA layer, widget-access isolation) genuinely demand more nodes.
  3. **Tools are thin shells** over the service layer (crud + plan + fold).
     LangChain abstractions never cross the tool boundary.
- Three tools:
  - `apply_changes({ reason, ops })` — the only write; one call = one reason
    = one revertible unit = one rewind anchor.
  - `read_day(day)` — drill-down into past days (fold snapshot + remarks, or
    raw plan/log if unfolded).
  - `fold_day({ day, remarks })` — snapshot computed by code, model supplies
    remarks only.
- Context is injected, not fetched: session start = distilled triple
  (yesterday's result, today's plan, today's log) + now/assistant-day; each
  turn prepends a delta of out-of-session ops since the last turn, so
  mid-session widget edits are visible without polling tools.
- System prompt = distilled behavior contract (identity, day model, tool
  rules), maintained separately from `assistant-behavior.md`; refined during
  implementation.

## Provider

- Gemini only at first, behind LangChain's chat-model interface (which is the
  contract's "models swappable behind an adapter").
- API key **and base URL** are entered in-app, assistant-scoped (separate from
  the daily-news `geminiApiKey`), stored via the existing settings secret
  twin-field machinery (`src/main/settings/store.ts`).
- Implementation gate: the JS wrapper must accept a base-URL override.
  Python's `ChatGoogleGenerativeAI` supports `base_url`; the JS side
  (`@langchain/google-genai`, or the newer unified `@langchain/google` /
  `ChatGoogle` the docs now recommend) was not confirmed at design time. If
  neither takes it, fall back to a thin custom chat model — the loop does not
  care.

## Surface

- Chat lives in a **separate window** (second BrowserWindow, own route).
  Opened from the plan widget's chat button; also a global shortcut
  (Electron `globalShortcut`, works from the tray).
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
5. **Analytics day boundary** — fold `aggregations.ts` onto the same day
   definition (see above), before the day model becomes visible in step 6.
6. **Day-sheet widget** — today's plan as one block, with the shallow edits.
7. **Assistant shell** — second window, route, assistant-scoped key and base
   URL, and the provider gate below.
8. **Agent loop** — LangGraph, the three tools, injected context.
9. **Rewind** — inverse replay of a session's ops.

Steps 1–6 carry no model code: the day record, its journal, and the sheet that
renders it are ordinary app features, usable on their own. The model arrives in
step 7 on top of a journal that has already been exercised by hand, so a bad
plan line is never ambiguous between a tool bug and a graph bug.

## Open at design time

- JS wrapper base-URL support (see Provider gate).
- System prompt distillation.
- Widget visual design (layout above is fixed; styling at implementation).
