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
