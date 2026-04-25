# Market Analysis — Architecture

Shared infrastructure and design principles for the market widget series. Investing philosophy: **macro-first, long-term DCA**. Day-trading and order-book scanners are out of scope.

Per-widget planned work: [`wip/market.md`](../wip/market.md).

## Overview

```
Electron Renderer
┌──────────────────────────────────────────────────────────┐
│  [Macro Indicators]   [Econ Calendar]   [Watchlist]      │
│        ✅                  ✅ Phase 1        🚧           │
└──────────────────────────┬───────────────────────────────┘
                           │ IPC (window.marketAPI)
                           ▼
                 ┌─────────────────────┐
                 │  src/main/market/   │
                 │  ├─ fred-client ✅  │
                 │  ├─ yahoo-client 🚧 │
                 │  └─ ecos-client 🚧  │
                 └──────────┬──────────┘
                            │ HTTPS
                            ▼
              FRED · Yahoo Finance · ECOS
```

## Reusable Infrastructure

| Asset | Location | Reuse pattern |
|---|---|---|
| External API client slot | `src/main/market/` | New data sources go here |
| Preload bridge | `src/preload/index.ts` `marketAPI` | Add new methods on the same surface |
| Time-series shared types | `src/entities/market-indicator/` | Reuse `SeriesPoint`, `SeriesSnapshot` |
| Chart stack | Recharts (`Sparkline.tsx` pattern) | Watchlist sparklines, yield curves |
| API key convention | `.env` + `MAIN_VITE_*` | Same prefix for any new key |
| IPC naming | `market:<source>:<action>` | Consistent channel namespace |

## Design Principles

Widgets exist to **lower the bar for research**. Forecasts and consensus numbers are interpretation, so we prefer official raw data.

- API keys live in the **main process only**. `MAIN_VITE_*` prefix injected by electron-vite — never bundled into the renderer
- All external HTTP goes through **main-process IPC handlers** — bypasses CORS, hides keys
- Financial data is **cached + persisted locally** — saves API quota, renders instantly on restart
- Time-series data uses the shared `entities/market-indicator` types — consistency across widgets
- IPC channel naming: `market:<source>:<action>` (e.g. `market:fred:getMany`, `market:yahoo:quote`)

## Calendar Event Type (Discriminated Union)

Already declared in the entity layer. Phase 1 only enables the `macro` branch; `earning` and `filing` activate in Phase 2/3.

```ts
type CalendarEvent =
  | { kind: "macro";   country, name, releaseId?, expected?, previous?, actual?, unit? }
  | { kind: "earning"; ticker, companyName, timing: "BMO"|"AMC", epsExpected, epsActual }
  | { kind: "filing";  ticker, formType: "10-K"|"10-Q"|"8-K"|...; title, url }
```

All three share `{ id, datetime, kind, country, importance }` so they render in the same `EventRow` and branch on `kind`.

## Data Source Policy

| Source | Limit | Cost | Use |
|---|---|---|---|
| FRED | 120 req/min | Free | Macro indicators, release schedule |
| Yahoo Finance | unofficial, reasonable use | Free | Tickers, indices, crypto (not yet built) |
| ECOS | rate-limited | Free | Korean macro (policy rate, KR CPI, M2 — not yet built) |
| SEC EDGAR | 10 req/sec, UA header required | Free | US filings (Phase 3 candidate) |
| OPEN DART | 20,000 req/day | Free | Korean filings (Phase 3 candidate) |
| ~~FMP~~ | ~~250 req/day~~ | ~~Free~~ | Economic/earnings calendar moved to paid plans (Aug 2025) — not used |
| Finnhub economic calendar | — | Paid (Basic $59/mo+) | Reconsider when adding estimates/consensus |

**Estimated total: $0/month** (current implementation).
