# Backlog

High-level direction and headline tasks per widget. Concrete work notes live under [`wip/`](wip/).

---

## Pomodoro Timer

**Direction**: from a plain timer to a "focus session tool". Layer in visual feedback first, then audio cues, then desktop-friendly UX (shortcuts, tray).

**Headline tasks** → [`wip/pomodoro.md`](wip/pomodoro.md)

- Circular progress ring (visual countdown)
- Sound alert + auto-start next phase (uninterrupted flow)
- Session stats + keyboard shortcuts
- Task label, tray timer display

**Cleanup — remove the localStorage→SQLite migration shim** (added in `86affec`, when the session log moved to `pomodoro.db`). The shim in `use-session-log-store.ts` (`migrateLegacyIfNeeded` / `readLegacySessions` / `normalizeLegacySessions` + the `pomodoro-session-log-migrated` flag, ~40 lines) is a one-shot per install and single-user only.

- Trigger: after the migrating release has actually run on every machine you use (dev and packaged migrate their own localStorage independently) and focus-analytics confirms the history is intact in `pomodoro.db`.
- Do it in a *later* release, never the migrating one — a machine must pass through the migrating version first.
- Scope: delete the three legacy functions + the flag/keys. Optionally add a one-shot `localStorage.removeItem("pomodoro-session-log")` + remove the flag to clear the orphaned backup blob, then drop that too a release later. Removing the shim leaves the store working; fresh installs just start empty.

---

## Todos

**Status**: the day list and the today widget both reorder by pointer-driven drag (`87b4dfc`). No headline tasks queued. The items below were consciously deferred during that rewrite, not overlooked.

- **Clipping at the scroll edge.** The dragged row moves in place with `translate3d`, so dragging past the widget's `overflow-y-auto` boundary clips it — the old OS drag ghost floated above everything and did not. The usual fix, a `position: fixed` drag layer, is specifically unsafe here: every react-grid-layout item carries a transform, which makes the widget the containing block for fixed descendants. Auto-scroll starts 48px from the edge so this is rarely reached; revisit only if it is actually noticed in use.
- **No drop animation.** Releasing between two slots snaps rather than glides. Adding it is a FLIP against the post-reorder layout plus a fourth `dropping` phase that ignores pointer input, and the `transitionend` exit must be paired with a timeout because a zero-delta transition never fires one. Independently addable; it was left out as the most bug-prone part of the feature.
- **No tests on the reorder geometry.** `lib/reorder-geometry.ts` is pure and node-testable, so a `.test.ts` drops in without restructuring. Worth it if that math is touched again: the insertion index across rows of *unequal* height is where a wrong formulation hides, and it is invisible in hand-testing.

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

## Cross-cutting

Not on deck. Promote to a real task when needed.

- Cross-widget instance communication (e.g. Watchlist tickers → Calendar earnings filter)
- Widget export/import (sharing dashboard layouts)
- Dark/light theme toggle (currently dark-only)
