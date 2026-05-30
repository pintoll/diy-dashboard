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
collect. Phases 3-4 depend on these model changes landing first (authored in a
separate worktree):

- `type FocusMode = "focus" | "leisure"` — `mixed` is removed.
- `attention: FocusMode` — final label, the user-confirmed truth. Existing
  `mixed` records must be bucketed (see open questions).
- `attentionSource: "auto" | "user"` — unchanged.
- `intendedMode: FocusMode | null` — start intent; drives focus-mode site
  blocking. Legacy records are `null` (never backfilled).
- session note — optional, sparse free text, for "that day, why?" context.
  Statistical analysis of note text is out of scope.

## Phase 1 — Route + weekly hero

- **What:** new route reachable from the pomodoro surface. Hero is
  this-week-vs-last-week **active hours**, stacked `total = focus + leisure`,
  split by final label (`attention`).
- **Flow:** a **"See more"** affordance on the `pomodoro-stats` widget ->
  page -> back to dashboard. The widget's existing heatmap/stats are untouched;
  only the link is added.
- **Seam:** local ISO week (Mon start); reuse the boundary logic in
  `entities/pomodoro-session/model/aggregations.ts`. Works on current data.

## Phase 2 — Celebration surface

- **What:** cumulative focused hours, current streak, contribution heatmap,
  overtime ("went beyond the plan"). Session **count** lives here as a
  secondary stat, below hours.
- **Flow:** below the hero; pure read, no interaction required.
- **Seam:** the heatmap is intentionally **repeated from the widget but at a
  larger scale** (e.g. full year vs the widget's short window) — reuse the same
  `pomodoro-stats` aggregations, one source of truth, don't fork. Widget = small
  heatmap, page = full heatmap.

## Phase 3 — Diagnosis surface

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

## Phase 4 — Day drill-down + memos

- **What:** click a day (hero bar / heatmap cell) -> that day's sessions with
  labels, intent, app breakdown, and any session notes. The "that day, why?"
  connective tissue.
- **Flow:** drill from any aggregate down to the day, then the session.
- **Seam:** depends on the session note field.

## Open seam / UX questions

- **Legacy `mixed` sessions:** bucket as leisure, as focus, or surface an
  "unmarked" slice? Affects hero accuracy for old data.
- **No-last-week state:** first week has nothing to compare against — what the
  hero shows then.
- **Layout:** one scrolling page (celebration on top, diagnosis below) vs an
  explicit lens toggle.
