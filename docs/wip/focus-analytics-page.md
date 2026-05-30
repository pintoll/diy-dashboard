# WIP — Focus Analytics Page

A dedicated **page** (not a widget) that analyzes the collected pomodoro/focus
data, reached via a link from the pomodoro surface. Read-only view over the
existing session log.

This doc fixes only **what goes where, the UX flow, and the data seams**.
Implementation of each phase is owned by whoever builds it — not specified here.

## Purpose — two lenses

1. **Celebration** — "look how much I did." Backward-looking, cumulative,
   affirming.
2. **Diagnosis** — "when do I weaken (leisure) or quit, and why that day?"
   Fine-grained, honest, investigative.

Serve both without one undermining the other. The weekly hero is deliberately
neutral (momentum): up feels good, down invites investigation.

## Data seam (cross-worktree contract)

Reads `useSessionLogStore` (localStorage). Phases 1-2 work on data we already
collect. Phases 3-4 depend on these model changes:

- `type FocusMode = "focus" | "leisure"` — `mixed` is removed.
- `attention: FocusMode` — final label, the user-confirmed truth. Existing
  `mixed` records must be bucketed (see open questions).
- `attentionSource: "auto" | "user"` — unchanged.
- `intendedMode: FocusMode | null` — start intent; drives focus-mode site
  blocking. Legacy records are `null` (never backfilled).
- session note — optional, sparse free text, for "that day, why?" context.
  Statistical analysis of note text is out of scope.

**As built (Phase 3 divergence):** the `FocusMode` / `mixed`-removal /
`intendedMode` model was planned to land from the separate `feature/make-focus-mode`
worktree, but at Phase 3 time it existed there only as design (unbuilt). So this
branch authored the **model slice itself** — `FocusMode` lives in
`entities/pomodoro-session` (with `AttentionVerdict = FocusMode` kept as a
compatibility alias), `mixed` removed, and `intendedMode` captured by the
**pomodoro-timer store** (declared before start, immutable while running). The
`feature/make-focus-mode` worktree later built the *same* fields via a different
shape (`shared/types/focus-mode.ts`, an `entities/focus-mode` signal store). The
two are a deliberate merge reconciliation, not a single source — see the focus
project memory for the recommended unification.

## Phase 1 — Route + weekly hero (DONE)

- **What:** new route reachable from the pomodoro surface. Hero is
  this-week-vs-last-week **active hours**, stacked `total = focus + leisure`,
  split by final label (`attention`).
- **Flow:** a **"See more"** affordance on the `pomodoro-stats` widget ->
  page -> back to dashboard. The widget's existing heatmap/stats are untouched;
  only the link is added.
- **Seam:** local ISO week (Mon start); reuse the boundary logic in
  `entities/pomodoro-session/model/aggregations.ts`. Works on current data.
- **Landed:** route `/focus-analytics` (`App.tsx`); page in
  `pages/focus-analytics/` (`FocusAnalyticsPage`, `WeeklyHero`); hero reads
  `weeklyActiveHours`; "See more" `Link` added to `PomodoroStatsClient`.

## Phase 2 — Celebration surface (DONE)

- **What:** cumulative focused hours, current streak, contribution heatmap,
  overtime ("went beyond the plan"). Session **count** lives here as a
  secondary stat, below hours.
- **Flow:** below the hero; pure read, no interaction required.
- **Seam:** the heatmap is intentionally **repeated from the widget but at a
  larger scale** (e.g. full year vs the widget's short window) — reuse the same
  `pomodoro-stats` aggregations, one source of truth, don't fork. Widget = small
  heatmap, page = full heatmap.
- **Landed:** totals are **all-time** via new `lifetimeStats` aggregation
  (focus / leisure / overtime hours + session count); streak reuses
  `computeCurrentStreak`. The widget `Heatmap` was **promoted to the entity
  layer** (`entities/pomodoro-session/ui/Heatmap.tsx`, exported via
  `client.ts`) and made configurable (`cellSizePx`, `showMonthLabels`); the
  widget renders it fluidly, the page renders a GitHub-style **52-week** grid
  with month labels and horizontal scroll. New page parts:
  `CelebrationStats`, `ContributionHeatmap`.

## Phase 3 — Diagnosis surface (DONE)

- **What:**
  - **Intent x outcome 2x2** — clean win / unexpected focus / honest rest /
    **collapse** (`intendedMode==="focus" && attention==="leisure"`).
  - **Time-of-day pattern** — when leisure/collapse sessions cluster ("this
    hour is where I weaken").
  - **App breakdown** — aggregate `processBuckets` across sessions: what stole
    focus. Note: focus mode blocks leisure sites, so collapse surfaces via
    manual label / idle, not app seconds.
- **Flow:** the "why" half; reached by scrolling or a lens toggle.
- **Seam:** depends on `intendedMode` + `mixed` removal.
- **Landed:** three pure aggregations in `aggregations.ts` —
  `intentOutcomeMatrix` (the four cells `heldLine` / `collapse` / `bonus` /
  `honestRest`, plus `excludedNullIntent` for legacy null-intent rows),
  `timeOfDayPattern` (24 local-hour buckets with focus/leisure/collapse counts),
  and `appBreakdown` (fold `processBuckets` to top-N apps by seconds). New page
  parts under `pages/focus-analytics/ui/`: `IntentOutcomeGrid` (hand-rolled 2x2,
  collapse cell emphasized, locked empty state when no intent has been declared),
  `TimeOfDayChart` (recharts stacked bars, collapse split out of leisure and
  highlighted), `AppBreakdownList` (Tailwind horizontal bars). Intent capture
  added to the pomodoro surface: a focus/leisure toggle in `PomodoroClient`
  backed by `intendedMode` in the pomodoro store (locked once running), threaded
  into all three record paths; session-log store migrated `v1 -> v2`
  (`mixed -> leisure`, `intendedMode` defaulted `null`) and the pomodoro store
  `v12 -> v13`.

## Phase 4 — Day drill-down + memos

- **What:** click a day (hero bar / heatmap cell) -> that day's sessions with
  labels, intent, app breakdown, and any session notes. The "that day, why?"
  connective tissue.
- **Flow:** drill from any aggregate down to the day, then the session.
- **Seam:** depends on the session note field.

## Open seam / UX questions

- **Legacy `mixed` sessions:** RESOLVED — bucketed as leisure (`bucketOf` in
  `aggregations.ts`); applies to hero and lifetime totals alike.
- **No-last-week state:** RESOLVED — hero shows "No comparison data yet" and
  omits the last-week bar when there is no history before this week.
- **Layout:** RESOLVED — one scrolling page. P2 celebration sits below the
  hero; P3 diagnosis is a "Diagnosis" header + three cards appended below the
  heatmap (no lens toggle — the single scroll reads celebration-then-diagnosis
  top to bottom).
