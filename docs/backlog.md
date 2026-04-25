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

**Direction**: hand-curated rules → feedback-driven personalization. Move from a fixed scoring formula to a profile that learns from accumulated user signals.

**Headline tasks** → [`wip/daily-news.md`](wip/daily-news.md)

- Pipeline B — collect 👍/👎 feedback (webhook + frontend buttons)
- Pipeline C — weekly signal accumulation drives short-term profile updates
- Order: B first (no data otherwise), enable C after 1–2 weeks of signal

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
