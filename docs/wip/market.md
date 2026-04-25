# WIP — Market Analysis Widgets

Architecture and shared infrastructure: [`design/market-architecture.md`](../design/market-architecture.md).

Currently live: Macro Indicators (6 FRED series), Economic Calendar Phase 1 (FRED release schedule).

## Watchlist + Indices 🚧

Real prices for tickers, indices, and crypto. The first widget that needs a **user-managed ticker UI**.

### Goal

```
┌─ Watchlist ─────────────────────────── [+ Add] ┐
│ Indices                                        │
│   ^GSPC   S&P 500      5,820.2   +0.35% ▲     │
│   ^KS11   KOSPI        2,680     -0.18% ▼     │
│ Crypto                                         │
│   BTC-USD Bitcoin      68,200    +1.2%  ▲     │
│ Stocks                                         │
│   NVDA    NVIDIA       142.3     +2.1%  ▲     │
│   005930.KS Samsung    72,400    -0.4%  ▼    │
└────────────────────────────────────────────────┘
```

### Data Sources

- **Yahoo Finance** (`yahoo-finance2` npm) — free, unofficial
  - Coverage: US/KR equities, indices (`^GSPC`, `^KS11`), crypto (`BTC-USD`)
  - Korean ticker suffixes: KOSPI `.KS`, KOSDAQ `.KQ`
- **CoinGecko** — only if on-chain crypto metrics are needed (funding rate, exchange netflow, etc.)

### Scope

- **Section grouping**: Indices / Crypto / KR equities / US equities
- **Add/remove ticker**: a settings dialog (FSD `features` layer)
- **Per-ticker mini sparkline**: 1W default
- **Detail modal on click**: longer-range charts (1M / 3M / 1Y)
- **Intraday auto-refresh**: 5-minute interval (off by default)

### New Files

```
src/main/market/
├── yahoo-client.ts            yahoo-finance2 wrapper
└── ipc.ts                     market:yahoo:{quote,chart}
src/preload/index.ts           marketAPI.yahoo.*
src/renderer/src/entities/
└── ticker/                    Ticker, Quote types
src/renderer/src/features/
└── manage-watchlist-ticker/   add/remove actions + dialog
src/renderer/src/widgets/
└── watchlist/
```

## Economic Calendar — Phase 2 🚧

Add estimates / consensus / actuals + an Earnings tab. Wait until paying for an API is justified. The current widget is drop-in ready (the entity already carries optional fields).

### Source Candidates

- Trading Economics guest, or paid FMP / Finnhub — for estimates and actuals
- FMP `/stable/earnings-calendar` or alternative — for earnings
- Both are paid. Re-check pricing at decision time.

### Scope of Changes

- New client (e.g. `finnhub-client.ts`, depending on the chosen source)
- Enrich step that fills `expected` / `previous` / `actual` on macro events from `releases-catalog`
- Earnings tab UI: enable "Earnings" in the existing `TypeFilter`, implement the `kind === "earning"` branch in `EventRow`

## Economic Calendar — Phase 3 🚧

EDGAR · DART filings. Start once specific companies become persistently interesting (after the watchlist settles).

- **SEC EDGAR**: US 10-K / 10-Q / 8-K / Form 4. Free, UA header required, 10 req/sec limit
- **OPEN DART**: Korean filings (annual reports, material disclosures). `MAIN_VITE_DART_API_KEY`, 20,000 req/day
- The headline value is a watchlist-driven filter: "show only filings from my tickers"

## ECOS Extension (Korean macro) 🚧

Add 2–3 Korea-specific indicators **into the existing macro widget**. Not a separate widget.

- Bank of Korea base rate, KR CPI, M2 money supply
- **Source**: Bank of Korea ECOS API (`https://ecos.bok.or.kr/api/`, free)
- **Changes**:
  - Add `src/main/market/ecos-client.ts`
  - Add the `market:ecos:series` handler in `ipc.ts`
  - Extend `indicators-catalog.ts` with a `source: "fred" | "ecos"` field
  - `fetchAll()` branches on `source` to pick the right client

## BOK Monetary Policy Calendar (optional)

Phase 1.5 candidate. Korean rate-decision dates as hardcoded YAML (BOK publishes the year's schedule annually).

- No public API → manually update a YAML once per year, commit it
- Add `country: "KR"` macro events to `releases-catalog.ts`

## Dependency Order

1. **ECOS extension** (1–2h) — easiest unlock, immediately useful
2. **Watchlist + Indices** (1–2 days) — line up with the moment real buying starts
3. **Calendar Phase 2** — estimates/actuals + earnings tab (when paid API is justified)
4. **Calendar Phase 3** — EDGAR/DART filings, after companies of interest are pinned
