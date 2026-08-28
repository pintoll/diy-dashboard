# Projects (PARA steering layer)

A mid/long-term steering layer above the day-scoped todo system, modeled on
PARA but folded to fit an execution dashboard. Todos stay "finish today";
projects answer "is the right work moving at all".

Status: **Phase 5 implemented** — the layer is complete.

## Why

The execution layer is complete: dated todos, desk, pomodoro attribution,
plan entries, day folds. The backlog (`date IS NULL`) is a flat warehouse.
What's missing is direction: nothing groups related work, nothing shows
whether a multi-week effort is progressing or rotting, and returning to an
effort after a long gap means reconstructing context from memory.

PARA is folded, not cloned:

- **Projects** and **Areas** become first-class rows (one table, `kind` field).
  A project has an end; an area doesn't.
- **Archives** is a *status* (`archived`), not a place. A separate bucket is
  pure management overhead.
- **Resources** is out of scope. It's knowledge management; memoPad and
  daily-news already cover it. Building a fourth bucket would duplicate them.

## Core rule: execution happens only in today's list

Projects must never become a second execution surface. The only interaction a
project has with "doing" is pulling a todo from its backlog onto today. This
preserves the existing philosophy (todo = finish today) and means daySheet,
todoToday, desk, and pomodoro need zero changes — at most a small project chip
on a todo row.

Corollary anti-goals: no sub-projects (one level; too big → split), no
gantt/dependencies, no deadline-pressure notifications from `target_date`
(it's a soft marker), no project-level timers.

## Data model

All in `todos.db`, so joins and `/api/apply` atomicity cover everything.

```sql
CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK(kind IN ('project','area')),
  title       TEXT NOT NULL,
  outcome     TEXT,             -- one line: "done means what" (projects only)
  status      TEXT NOT NULL CHECK(status IN ('active','someday','done','archived')),
  target_date TEXT,             -- nullable, soft marker, projects only
  sort_order  INTEGER,
  created_at  TEXT, updated_at TEXT, archived_at TEXT
);

CREATE TABLE project_docs (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,     -- app-level link, no FK (plan_entries precedent)
  title      TEXT NOT NULL,     -- "notes" created by default per project
  body       TEXT NOT NULL DEFAULT '',
  sort_order INTEGER,
  created_at TEXT, updated_at TEXT
);

ALTER TABLE todos ADD COLUMN project_id TEXT;  -- nullable, no FK, additive
```

`ops.entity` CHECK must be rebuilt to add `'project'` and `'project_doc'`
(SQLite can't alter a CHECK; migration-5-style table rebuild). Worth it: every
project/doc change then flows through the same append-only journal the
assistant already uses, giving audit and rewind for free.

Freeform text lives in `project_docs`, not a `projects.note` column — one
place for prose, no duplication.

### Backlog gains structure

- `date IS NULL AND project_id IS NOT NULL` — **project backlog** (that
  project's next actions).
- `date IS NULL AND project_id IS NULL` — **inbox** (unclassified capture).
- `date = today` — unchanged execution list.

Capture stays zero-friction: project assignment is never forced at capture
time (that's review's job). The todos-page backlog section shrinks to inbox
only; project backlogs live on the projects page.

**Next action** = top open todo (`sort_order`) of a project's backlog. An
active project with an empty next action is effectively dead — review surfaces
this.

### Archive semantics

Archiving a project hides its undated todos with it (backlog/inbox queries
exclude todos of non-active projects). Dated open todos stay on their day —
they were consciously scheduled. Archived projects keep their full history:
total worked time, session count, completed todos. The archive tab is a record
of finished things, useful for retrospectives and estimating the next project.

### Time rollup for free

`todo_sessions` already accrues `worked_sec` per todo; with `project_id` one
join yields per-project invested time. Progress = done/total todos + total
time. Focus analytics adds a per-project view with no schema change (phase 5),
though not by summing `worked_sec` — see that phase for why.

## Project docs (rough notes)

Per-project freeform text — goals, facts discovered mid-work, decisions,
state. The "txt file" feel without real files:

- **DB, not filesystem.** The agent API is the single data plane; real files
  would add a second surface with Windows/WSL path mapping and no `/api/apply`
  atomicity. Body is plain text; rendering is a textarea.
- **Multiple named docs per project**, but each project auto-creates one
  default `notes` doc and the UI is a thin tab strip. No file manager.
- **History via ops journal** (`entity='project_doc'`, before/after
  snapshots). UI autosave debounced (idle/blur) so the journal isn't spammed
  per keystroke. Bodies are rough notes, a few KB — fine for SQLite.

**Note vs backlog role separation** (the discipline that keeps notes useful):
the note holds *context* — why, decisions, facts, current state; the backlog
holds *actions*. "Next: rotate the API key" written in prose rots; the ritual
(or the secretary) extracts such lines into backlog todos.

## Surfaces

| Surface | Role | Cadence |
|---|---|---|
| todoToday / daySheet / desk | Execution, today only | all day |
| projects widget | Steering glance: what moves, what rots | 1-2 looks/day |
| `/projects` page | Management + review, PARA's home | weekly + as needed |
| todos-page inbox | Unclassified capture bin | emptied at review |
| Secretary (dyd / apply) | Review assist, ritual drafting | daily + weekly |

### `/projects` page (master-detail, like finance)

- **Left**: project list — inbox (count badge, top), then active (last-activity
  date, stale badge at 7+ days), areas, someday, archived.
- **Right** (selected project): outcome + target date, progress (done/total +
  accrued time), doc tabs (default `notes`, plain textarea, autosave),
  backlog list (reorderable, add form, per-item "to today"), the read-only
  scheduled list, collapsed completed history.
- Selecting inbox turns the right pane into a triage UI: per-item project
  picker + date picker + delete.

### Widget (built after the page)

Compact steering card: active projects with title, progress, next action,
last-activity; stale projects dimmed/badged (the ambient nag that replaces
discipline). The next action carries a one-click pull onto today — the whole
morning ritual, without leaving the dashboard. Anything deeper is the page's
job: the title links straight to it. (The sketch had a drill-down dialog here
instead; phase 3 below records why it went.)

## Rituals

**Morning (~5 min, no page visit needed).** Widget glance → pull 1-3 next
actions onto today, merge with date-native items. Drill-down's note tail gives
re-entry context. Secretary variant: morning brief includes the notes of
pulled todos' projects.

**Evening (hooks the existing day fold).** The fold's snapshot lists the
projects the day moved (from `todo_sessions` + completions) and the secretary
offers a per-project note append. Secretary drafts it: "2026-08-27: finished IPC wiring; next: widget
registration; watch normalizeDate." Dated appends make the worklog automatic —
nobody maintains it, it accumulates.

**Weekly review (the page's reason to exist).** (1) Empty inbox — assign /
date / delete each item. (2) Sweep active by last-activity: anything the stale
rule has already flagged (7 days — the sketch said two weeks; the badge is the
implemented threshold, see phase 2 below) → "still worth it?" → demote to
someday or archive; empty next action → fill one. (3) Sweep someday for
promotions. Secretary does the mechanical half via one `/api/apply` batch; the
user only judges.

**Re-entry after a long gap** (the payoff): open the project — note tail =
last state and next step, backlog top = next action. Or ask the secretary
"where was I on X?" — it briefs from note + recent sessions + completed todos.

Honest risk: if review stops, someday and inbox rot. Mitigations are the stale
badge (daily visual nag) and the secretary (reduces review to judgment). If
neither works, that's not a tooling problem.

## API

- `GET/POST /api/projects`, `PATCH /api/projects/:id` — CRUD; delete
  discouraged in favor of archive (if deleted: detach todos, app-level).
- `GET /api/projects/:id/todos` — its backlog + completed.
- `GET/POST /api/projects/:id/docs`, `PATCH /api/docs/:id` — docs; PATCH
  supports append for ritual writes.
- `/api/apply` gains `project` and `project_doc` entities so review batches
  (demotions + note appends + inbox triage) are atomic under one reason.
- Mirror IPC channels as with todos. `dyd projects` subcommand follows.

## Phases

1. **Schema + plumbing** — *done*: `projects`, `project_docs`,
   `todos.project_id`, ops CHECK rebuild; CRUD/IPC/routes; project picker in
   todo edit dialog; todos-page backlog section reduced to inbox. Deviations
   from the sketch above: `GET /api/todos/backlog` kept its whole-warehouse
   meaning (the secretary partitions by `projectId` itself) while the app's
   inbox got its own query and IPC channel; `kind` is editable and delete is
   exposed on both surfaces, since archive is a recommendation, not a
   constraint.
2. **`/projects` page** — *done*: master-detail, docs editor with a tab strip,
   inbox triage, pull-to-today, and the edit dialog's parked-or-filed guard
   dropped, since the project backlog is now a real surface. Deviations:
   - `listProjectTodos` gained a third list, **`scheduled`** (dated and open).
     Without it a todo vanished from its project the moment it was pulled onto
     a day, which reads as data loss. It is read-only context; execution is
     still only on the day.
   - A new **`projects:stats`** rollup (`src/main/todos/project-stats.ts`) —
     the sketch assumed the page could derive progress and last-activity from
     what it already had, and it cannot: neither is on a project row, and one
     `projects/:id/todos` call per project would be N round trips for one
     screen. One grouped query returns progress, invested time, open-backlog
     count and a last-activity day for every project at once. "Activity" means
     work banked, a todo finished, or a note written — never a rename.
   - The **stale badge fires at 7 days**, which is now the layer's one
     threshold: the review sweep above was rewritten to read it rather than
     keep a second number. An active project that has never moved counts as
     stale, and areas never do, since an area has no end to drift from.
   - "Master-detail, like finance" turned out to be wrong about finance, which
     is a single stacked column. This page introduces the app's first two-pane
     layout rather than reusing one.
   - Filing a todo now re-appends its `sort_order`, because the undated bucket
     is split by project: carrying an inbox number into a backlog dropped the
     row into the middle of that list.
3. **Widget** — *done*: the steering card (active projects with progress, next
   action and last-activity; stale rows dimmed and badged) and the fold's
   project attribution. Deviations:
   - **No drill-down dialog.** A card's title deep-links to
     `/projects?project=<id>` instead. The dialog the sketch describes — outcome,
     note tail, backlog, quick-append — would have duplicated the page it was
     explicitly built after; the page consumes the param once and strips it.
   - **The fold half is data only.** There is still no in-app fold action: the
     day sheet's "yesterday unfolded" hint stays display-only and folding
     remains `POST /api/days/:day/fold` / `dyd fold`. What changed is the
     snapshot, now `v: 2` with `todos[].projectId` and a `projects` rollup of
     what the day actually moved, so one fold call names the projects worth a
     worklog line. The append itself was already there
     (`PATCH /api/docs/:id { "append": ... }`). Older folds stay `v: 1` until
     re-folded; a snapshot is derived state, so there is no migration.
   - **Active projects only**, and no widget config. `isStale` never fires for
     an area, so an area on the card would be permanent, unactionable noise.
   - The **pull-to-today is kept** despite the dialog going away: it is the only
     project-into-doing interaction the core rule permits, and without it the
     morning ritual becomes a page round trip. It sits on the next-action line.
   - `projects:stats` gained **`nextAction`** (the backlog head, under
     `listProjectTodos`'s own ordering) — the card needs it for every project at
     once, and one `projects/:id/todos` call each would be N round trips for one
     glance. It is the rollup's only non-aggregate field, and the first one a
     **reorder** can move, so the renderer's refresh gate now listens for that
     reason too.
   - `isStale` / `STALE_AFTER_DAYS` moved from the page's `group-projects.ts`
     down to `entities/project/lib/stale.ts`: two surfaces nag with the rule
     now, and widgets may not import from pages.
4. **Secretary integration** — *done*: `/api/apply` gained `project.*` and
   `project_doc.*` ops, `dyd projects` gained a full quick-lane surface, and the
   secretary workspace (`~/secretary`) learned the layer — a `## Projects`
   section, the three rituals in `## Session discipline`, and an active-projects
   block in its SessionStart hook. Deviations:
   - **The focus-analytics per-project view became phase 5.** It is a different
     problem from the rest of this phase: pomodoro sessions live in
     `pomodoro.db` (they carry the attention verdict but no project link) while
     the time ledger is `todo_sessions` in `todos.db` (accurate `worked_sec`, no
     verdict), and the two databases have never been joined. Nothing above
     depends on it.
   - **A new `GET /api/projects/stats` route.** `listProjectStats` was IPC-only,
     so a CLI glance would have been 1+N round trips and `nextAction` — the
     thing the morning pull acts on — was reachable nowhere in one call.
   - **`isStale` moved again**, from `entities/project/lib/` down to
     `@shared/project-stale`, and the stats route now emits the verdict. Phase 3
     moved it for two renderer surfaces; the CLI and the session hook are a
     third and fourth, and they read over HTTP where **today is the server's
     call**. Renderer surfaces still call it themselves against `useToday()`,
     because a dashboard window stays open across the 05:00 boundary.
   - **`"$N"` works from a todo's `projectId`**, not just from the doc op's.
     Without it "open the project and file its first actions" could not be one
     intent, which is the batch's whole purpose. `projectId` is an ordinary body
     field, so it is lifted out only when it actually carries the sigil.
   - **The command is `dyd projects`, plural**, against the CLI's 4-of-4
     singular precedent (`todo`, `source`, `cred`, `pomo`): those act on one of
     a kind, while this one's headline act is the cross-project glance, and
     every other name in the system is already plural.
   - **`p<n>` is a global handle**, a position in the unfiltered project list
     rather than in the view as printed — the one deliberate departure from
     `<n>`/`b<n>`. Projects are few and long-lived where todos churn, so a
     number that survives filtering is worth the visible gaps.
   - **No `dyd projects rm`.** Deleting detaches todos and destroys docs; that
     stays an app act or a spelled-out `apply` batch.
   - **`dyd todo backlog` now groups by project.** The route always returned the
     rows grouped; the flat renderer threw it away, which left the inbox
     indistinguishable from filed work and made `file b3 p2` unusable.
   - Along the way: `dyd day` now prints the fold snapshot's `projects moved`
     rollup, which had been shipping unread since phase 3, and the repo's two
     `~/workspace/secretary` references were corrected to `~/secretary`.
   - Post-review follow-ups: **doc titles are unique per project** (they double
     as addresses, so a duplicate would swallow writes silently), and
     **`project.create` takes a `notes` seed body** — the default doc's id is
     minted inside the create, so no `"$N"` ref can reach it and "open the
     project with its first note" needed a first-class path. The stale verdict
     moved out of `listProjectStats` into the HTTP route alone (`ProjectStats`
     stays transport-neutral; the IPC payload can no longer carry a day frozen
     at fetch time), and the stats route grew `inboxCount` so the CLI glance
     stopped fetching the whole backlog for one badge.
5. **Focus analytics per-project view** — *done*: a `Projects` card in the
   page's Diagnosis half, ranking projects by wall-clock time with each one's
   focus share and collapse count, plus `GET /api/projects/time` so the weekly
   review can read the same numbers. Deviations:
   - **There is no session join to build on, and there never was.** The obvious
     key — `todo_sessions.session_id` — does not address the pomodoro session
     record: the ledger's id is minted by the attribution engine at work-block
     start, the log record's at record time, and nothing reconciles them. A
     comment in `use-session-log-store.ts` asserted the link outright; it is
     corrected, as is the `todo_sessions` note in `todos/schema.ts`. The real
     link is the session record's **`todoIds`**, the desk union already used
     cross-database by the day drill-down.
   - **So the card carries two numbers on two bases**, and says so. The bar is
     todos.db: every banked interval **merged** per project
     (`todos/project-time.ts`), because the ledger banks each desk member in
     full and summing `worked_sec` would report 50 minutes for a 25-minute
     block shared by two todos of one project. On a real ledger the merge cut
     42% of the additive total, which is how much of it was one desk counted
     twice. The focus share and collapse count are pomodoro.db, resolved per
     **session** through `todoIds`. They are never divided into one another.
   - **The merge runs on the credited window, not the interval span.** Checking
     the first cut against the real Windows ledger caught the assumption: a
     row's `ended_at - started_at` is *not* its `worked_sec`, because the
     credited figure is block overlap capped at the phase end plus a share of
     an already idle-excluded, capped `overtime_sec`. Spans over-reported by
     ~0.6%, and a card that disagreed with `todos.worked_sec` would have been
     wrong in the direction of flattering idle time. Each row now contributes
     `[started_at, started_at + worked_sec]` — its head, since the uncredited
     part is always the tail.
   - **Merging does not remove all overlap, deliberately.** Two *different*
     projects on one desk each keep the whole block — the desk model's own
     no-division rule — so the rows can sum past the day's wall clock. Hence a
     ranked bar list and never a pie, and hence a footnote for session time
     that had nothing on the desk at all.
   - **A second read-through store** (`use-project-time-store`) rather than a
     field on `useProjectStore`: only this page wants the whole ledger merged,
     and the projects page and every todo picker would otherwise pay for a full
     `todo_sessions` scan on each refresh.
   - `sessionActiveSec`, `bucketOf` and a new **`isCollapse`** were promoted out
     of `aggregations.ts`'s private scope. The collapse question was already
     asked in two places with the condition written out twice; the card would
     have been a third.
