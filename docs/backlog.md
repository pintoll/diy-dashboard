# Backlog

High-level direction and headline tasks per widget. Concrete work notes live under [`wip/`](wip/).

---

## Pomodoro Timer

**Direction**: from a plain timer to a "focus session tool". Layer in visual feedback first, then audio cues, then desktop-friendly UX (shortcuts, tray).

**Headline tasks** → [`wip/pomodoro.md`](wip/pomodoro.md)

---

## Todos

**Status**: the day list and the today widget both reorder by pointer-driven drag (`87b4dfc`). No headline tasks queued. The items below were consciously deferred during that rewrite, not overlooked.

- **Clipping at the scroll edge.** The dragged row moves in place with `translate3d`, so dragging past the widget's `overflow-y-auto` boundary clips it — the old OS drag ghost floated above everything and did not. The usual fix, a `position: fixed` drag layer, is specifically unsafe here: every react-grid-layout item carries a transform, which makes the widget the containing block for fixed descendants. Auto-scroll starts 48px from the edge so this is rarely reached; revisit only if it is actually noticed in use.
- **No drop animation.** Releasing between two slots snaps rather than glides. Adding it is a FLIP against the post-reorder layout plus a fourth `dropping` phase that ignores pointer input, and the `transitionend` exit must be paired with a timeout because a zero-delta transition never fires one. Independently addable; it was left out as the most bug-prone part of the feature.
- **No tests on the reorder geometry.** `lib/reorder-geometry.ts` is pure and node-testable, so a `.test.ts` drops in without restructuring. Worth it if that math is touched again: the insertion index across rows of *unequal* height is where a wrong formulation hides, and it is invisible in hand-testing. The math itself was read closely at `5e89a51` and is correct — `unit` (dragged row height + gap) is the right displacement for every shifted row regardless of their own heights, because removing the dragged row closes a gap of exactly that size, and freezing the comparison against pre-drag centers is what prevents oscillation. So this item is about regression cover, not a suspected bug.

---

## Daily News Pipeline

**Status**: feedback collection and weekly signal-driven profile updates have both shipped — see [`design/daily-news-pipeline.md`](design/daily-news-pipeline.md). No headline tasks queued; promote a new one here when a concrete direction (e.g. per-source tuning, better parse-failure handling) is picked up.

---

## Market Analysis

**Direction**: macro → calendar → tickers, each widget lowering the bar to research. Avoid pre-digested forecasts; surface official raw data.

**Headline tasks** → [`wip/market.md`](wip/market.md)

- ECOS extension (add Korean macro series to the macro widget)
- Watchlist + Indices (Yahoo Finance, user-managed tickers)
- Economic Calendar Phase 2 (estimates/actuals + earnings tab; revisit when paid API is justified)
- Economic Calendar Phase 3 (SEC EDGAR · OPEN DART filings)

---

## In-App Assistant

**Direction**: a thought-organizing secretary living inside the app. Behavior
contract is fixed in [`design/assistant-behavior.md`](design/assistant-behavior.md),
architecture in [`design/assistant-architecture.md`](design/assistant-architecture.md);
phases 1-8 (day record, journal, log view, analytics boundary, day-sheet
widget, batch apply route, secretary workspace) are implemented. The brain is
Claude Code in `~/secretary`, not an in-app shell — the second-window design
was dropped. Phase 9 (rewind) stays deferred: reverting is compensating ops
under a `revert: ...` reason.

- Widget access expansion: widen the assistant's reach beyond todos/pomodoro
  widget by widget, keeping widgets isolated from each other.

---

## Projects (PARA)

**Status**: shipped — the steering layer above the day list. Projects and areas
as first-class rows, per-project docs, the backlog split into inbox and project
backlogs, the steering widget, the fold's project attribution, `dyd projects`,
and the focus-analytics per-project view. Design and every as-built deviation
live in [`design/projects-para.md`](design/projects-para.md). No headline tasks
queued.

Deliberately not built, and not to be promoted here without a rethink:
sub-projects, dependencies, deadline pressure from `target_date`,
project-level timers. Execution happens only in today's list.

---

## Cross-cutting

Not on deck. Promote to a real task when needed.

- Cross-widget instance communication (e.g. Watchlist tickers → Calendar earnings filter)
- Widget export/import (sharing dashboard layouts)
- Dark/light theme toggle (currently dark-only)
