# WIP — Market Analysis Widgets

Architecture and shared infrastructure: [`design/market-architecture.md`](../design/market-architecture.md).
Connector protocol: [`spec/connector-protocol.md`](../spec/connector-protocol.md).

Currently live: Macro Indicators and Economic Calendar Phase 1, both driven by
declarative connectors rather than a hardcoded catalog. A FRED default set is
seeded on first run; other sources (e.g. Upbit BTC) are added as config.

**This changes what "new data source" costs.** Anything whose JSON can be
reached by dot paths is a `connectors.json` entry with zero code. So the plans
below are now split by that test: most are config, and only the ones that need
a *protocol* change are still engineering work.

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

The obvious pick, Yahoo, is the one shape the connector protocol deliberately
does not support:

- **Yahoo Finance** — returns **parallel arrays** (`timestamp[]` alongside
  `indicators.quote[0].close[]`), not a list of row objects. Dot paths address
  rows, so this cannot be expressed. Supporting it means a second response
  schema variant, which was rejected on purpose: more schema variants means
  more ways for an AI-authored connector to be silently wrong. Using Yahoo
  therefore means either a protocol change or a dedicated client — a decision,
  not a detail.
- **Already working via connectors**: Upbit (verified in use). Binance,
  Coinbase, Bithumb, CoinGecko all return arrays-of-arrays, which dot paths
  reach by index (`datePath: "0"`, `valuePath: "4"`) — verified.
  - CoinGecko caveat: `days<=90` returns *hourly* points, which collapse
    against the `YYYY-MM-DD` point model and made "1D change" actually a 1-hour
    change. Use `days=365`.
- **Still unsourced**: KOSPI, Samsung, individual KR/US equities. Needs an
  official-key API whose response shape is confirmed row-based first.

Note the whole model is **date-granular**. Genuine intraday needs a datetime
point model, which is a bigger change than any single connector.

### Scope

- **Section grouping**: Indices / Crypto / KR equities / US equities
- **Add/remove ticker**: a settings dialog (FSD `features` layer)
- **Per-ticker mini sparkline**: 1W default
- **Detail modal on click**: longer-range charts (1M / 3M / 1Y)
- **Intraday auto-refresh**: 5-minute interval (off by default)

### New Files

Data fetching is **not** in this list — connectors already provide it. What is
left is presentation and per-ticker grouping:

```
src/renderer/src/entities/
└── ticker/                    Ticker, Quote types
src/renderer/src/features/
└── manage-watchlist-ticker/   add/remove actions + dialog
src/renderer/src/widgets/
└── watchlist/
```

The open design question is how a watchlist row maps to a connector: one
connector per ticker (simple, but the list grows unbounded) versus a templated
connector parameterized by symbol (needs a protocol concept that does not exist
yet). Settle this before building the UI.

## Economic Calendar — Phase 2 🚧

Add estimates / consensus / actuals + an Earnings tab. Wait until paying for an API is justified. The current widget is drop-in ready (the entity already carries optional fields).

### Source Candidates

- Trading Economics guest, or paid FMP / Finnhub — for estimates and actuals
- FMP `/stable/earnings-calendar` or alternative — for earnings
- Both are paid. Re-check pricing at decision time.

### Scope of Changes

- The fetch itself is an `events` connector, not a new client — assuming the
  chosen provider returns row objects
- **Blocker: the `events` kind carries `date` and `label` only.** There is no
  place to put `expected` / `previous` / `actual`, and the old
  `releases-catalog` that would have supplied them is deleted. Enrichment needs
  the protocol to grow optional numeric fields on events first. This is the
  real work in Phase 2, not the API choice.
- Earnings tab UI: enable "Earnings" in the existing `TypeFilter`, implement the `kind === "earning"` branch in `EventRow`

## Economic Calendar — Phase 3 🚧

EDGAR · DART filings. Start once specific companies become persistently interesting (after the watchlist settles).

- **SEC EDGAR**: US 10-K / 10-Q / 8-K / Form 4. Free, UA header required, 10 req/sec limit
- **OPEN DART**: Korean filings (annual reports, material disclosures). 20,000 req/day. Key goes in a `dart` credential pinned to `opendart.fss.or.kr`, not an env var
- The headline value is a watchlist-driven filter: "show only filings from my tickers"

## ECOS Extension (Korean macro) 🚧

Add 2–3 Korea-specific indicators **into the existing macro widget**. Not a separate widget.

- Bank of Korea base rate, KR CPI, M2 money supply
- **Source**: Bank of Korea ECOS API (`https://ecos.bok.or.kr/api/`, free)
- **Changes**: none in principle — a `series` connector per indicator, added via
  Settings or `dyd source add`. The response nests as
  `StatisticSearch.row[]`, which dot paths already reach.

**One thing to verify first: ECOS date formats.** `normalizeDate` accepts
`YYYY-MM-DD`, ISO datetimes, and epoch numbers. ECOS `TIME` is none of those,
and the two shapes fail differently:

- `"20240115"` (daily) → `Invalid Date` → the row is skipped. Loud enough: a
  connector that parses zero usable points is rejected at save time.
- `"202401"` (monthly) → parses to **year 202400**, not an error. It would sort
  to the far future and silently poison the series.

So ECOS is config-only *if* a compact-format branch is added to `normalizeDate`
first (`YYYYMM` / `YYYYMMDD`). That is a protocol change, small but real, and it
should land with a test before any ECOS connector is saved. Treat the "1–2h,
zero code" framing below as contingent on it.

## BOK Monetary Policy Calendar (optional)

Phase 1.5 candidate. Korean rate-decision dates, published by BOK once a year
with no public API.

This is the one case the connector model does not help with: connectors fetch
HTTP, and there is nothing to fetch. It needs either a static bundled list or a
connector kind that reads local data — neither exists. `releases-catalog.ts`,
where this used to be headed, is deleted. Park it until the ECOS work says
whether Korean macro is worth the surface area.

## Dependency Order

Re-ordered around what the connector protocol already does. Each item is tagged
with whether it is config or a protocol change.

1. **ECOS extension** — *protocol, small*. Add `YYYYMM`/`YYYYMMDD` to
   `normalizeDate` with a test, then the indicators are pure config. Still the
   easiest unlock.
2. **Watchlist + Indices** — *config + UI*, once the connector-per-ticker
   question above is settled. Data path already exists; Yahoo does not.
3. **Calendar Phase 2** — *protocol*. Needs numeric fields on the `events` kind
   before any paid API is worth buying.
4. **Calendar Phase 3** — EDGAR/DART filings, after companies of interest are pinned

Sources still unsourced (KOSPI, Samsung, individual equities) are blocked on
finding a row-based API, not on app work.
