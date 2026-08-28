# Focus Analytics Page

A dedicated **page** (not a widget) that analyzes the collected pomodoro/focus session log, reached via a "See more" link from the `pomodoro-stats` widget. Read-only, and no longer over one store: the pomodoro session log (`useSessionLogStore`) carries the page, and the projects card adds a second, cross-database read of the todos.db time ledger (`use-project-time-store`) — see **Project attribution** below. The intent-declaration and site/app blocking mechanism the page visualizes is documented separately in [`focus-mode.md`](focus-mode.md).

## Purpose — two lenses

1. **Celebration** — "look how much I did." Backward-looking, cumulative, affirming.
2. **Diagnosis** — "when do I weaken (leisure) or quit, and why that day?" Fine-grained, honest, investigative.

The page serves both without one undermining the other: celebration content sits above a "Diagnosis" header, read top to bottom as one scroll, no lens toggle. The weekly hero is deliberately neutral (momentum): up feels good, down invites investigation.

## Data model

Reads `PomodoroSessionRecord` from `entities/pomodoro-session` via `useSessionLogStore`. The store is a reactive in-memory cache hydrated once over IPC from a SQLite table (`pomodoro.db`, `src/main/pomodoro/`); every session/note write goes through to SQLite, so the page's reads stay synchronous and reactive. (It was localStorage-backed until the 2026-07 move off the ~5MB quota; a one-time shim imports any old localStorage log.) The fields the page depends on:

- `attention: FocusMode` (`"focus" | "leisure"`) — final label, the user-confirmed truth. The old three-way `mixed` verdict was removed; legacy `mixed` records are bucketed as `leisure` (`bucketOf` in `aggregations.ts`).
- `attentionSource: "auto" | "user"` — whether the verdict was auto-computed or hand-set.
- `intendedMode: FocusMode | null` — start intent, declared before the session and immutable while running (see `focus-mode.md`). `null` on legacy records predating the field; never backfilled, since a fake intent would pollute the intent×outcome analysis.
- `sessionEndType: "completed" | "early-stop"` — how the session ended.
- `processBuckets: Record<string, number>` — foreground-seconds per exe, folded into the app breakdown.
- `note: string | null` — optional free text per session, authored/edited inline in the day drill-down.

All aggregation is a set of pure functions in `entities/pomodoro-session/model/aggregations.ts`, shared with the `pomodoro-stats` widget so the widget and the page never disagree on totals.

## Page structure

Route `/focus-analytics` (`App.tsx`), rendered by `FocusAnalyticsPage` (`pages/focus-analytics/ui/`). Sections, top to bottom:

| Section | Component | Aggregation | Notes |
|---|---|---|---|
| Weekly hero | `WeeklyHero` | `weeklyActiveHours` | This-week-vs-last-week active hours, stacked `total = focus + leisure`. Shows "No comparison data yet" and omits the last-week bar when there's no history before this week. |
| Daily trend | `DailyTrendChart` | `dailyActiveHours` | 7-day navigable bar chart (prev/next arrows), stacked focus/leisure per day, per-day session count in the tooltip. |
| Celebration stats | `CelebrationStats` | `lifetimeStats`, `computeCurrentStreak` | All-time focus/leisure/overtime hours, session count, current streak. |
| Contribution heatmap | `ContributionHeatmap` | `buildHeatmapCells` | GitHub-style 52-week grid with month labels, horizontal scroll. `Heatmap` itself lives in the entity layer (`entities/pomodoro-session/ui/Heatmap.tsx`, configurable `cellSizePx`/`showMonthLabels`) so the widget's small heatmap and the page's full heatmap render from one implementation. Clicking a day with `count > 0` opens the drill-down; empty/future cells are inert. |
| Intent × outcome grid | `IntentOutcomeGrid` | `intentOutcomeMatrix` | Hand-rolled 2×2 — held-line / **collapse** (intent focus, outcome leisure) / bonus / honest-rest — collapse cell emphasized. Locked empty state when no session has a declared intent yet. |
| Time-of-day chart | `TimeOfDayChart` | `timeOfDayPattern` | 24 local-hour buckets, stacked focus/leisure bars with collapse split out and highlighted — surfaces which hour is where focus tends to slip. |
| App breakdown | `AppBreakdownList` | `appBreakdown` | Top-N apps by total foreground seconds across all sessions. Note: focus mode blocks distracting sites/apps, so a collapse leaves little trace here — the blocked browser never loads. Collapse is caught by the intent×outcome grid (manual re-label / idle), not by app-usage stats. |
| Projects | `ProjectFocusList` | `buildProjectFocusRows` (page lib) | Ranked bars of wall-clock time per project, each with the focus share and collapse count of the sessions it sat through. Includes a `No project` row (unfiled or deleted todos) and a footnote for session time that had nothing on the desk. All-time, like the two cards around it. See **Project attribution** below. |
| Day drill-down | `DayDrillDown` (Radix `Dialog`) | `sessionsOnDate` | Opened by clicking a heatmap cell. Lists that day's sessions with intent/outcome badges (collapse emphasized), top apps per session, and an editable note textarea (saved on blur). Only the heatmap is a drill-in entry point — the hero and trend chart are aggregates that don't map to a single day. |

## Project attribution

The projects card is the page's only cross-database read, and the two databases
share no session key. `todo_sessions.session_id` (todos.db) is minted by the
attribution engine at work-block start; `sessions.id` (pomodoro.db) is minted
when the log record is written. They have never been the same value, despite
comments that once claimed otherwise. The one real link is the session record's
`todoIds` - the desk union stamped at record time.

So the card's two numbers come from two places and are deliberately never
combined:

| Number | Source | Rule |
|---|---|---|
| Time bar | todos.db `todo_sessions`, merged per project (`src/main/todos/project-time.ts`, served by `projects:time` / `GET /api/projects/time`) | Wall clock. Two todos of the *same* project on the desk through one block count that block once. Merged on each row's **credited window** (`started_at` + `worked_sec`), not its raw span: `worked_sec` already excludes idle and trimmed/capped overtime, and a real ledger over-reported by ~0.6% on spans. |
| Focus share, collapses | pomodoro.db session log, resolved through `todoIds` -> `todos.project_id` | Session-weighted. A session counts in full for every project its desk touched. |

`focusSec / deskSec` therefore reads "how focused were the sessions this project
sat through", not "how many of its merged seconds were focused".

Both halves inherit the desk model's no-division rule ([`multi-pomo-todo.md`](multi-pomo-todo.md)):
two *different* projects on one desk each keep the whole block, so the rows can
sum past the day's wall clock. That is why this is a ranked bar list and never a
pie. Attribution follows a todo's *current* `project_id`, so refiling moves
history - the same behaviour `listProjectStats` already has.

## Design decisions

- **Legacy `mixed` sessions**: bucketed as `leisure` everywhere (hero, lifetime totals, matrix) via `bucketOf`.
- **No-history state**: hero omits the comparison bar and shows a placeholder instead of a misleading zero.
- **Layout**: one scrolling page, celebration above a "Diagnosis" header, no lens toggle — reads celebration-then-diagnosis top to bottom.
- **Heatmap reuse**: promoted to the entity layer instead of forking a second implementation for the page's larger scale.
- **Projects sit in the Diagnosis half**, between the time-of-day chart and the app breakdown: the section reads what slipped, when it slipped, which work it slipped on, and which app took it.
- **No project drill-down and no time window** on the card. The page has exactly one drill-in entry point (the heatmap) and one navigable range (the daily trend); a project's own history is the `/projects` page's job.
