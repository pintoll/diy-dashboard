# Macro Indicators Widget

Shows time-series indicators as a card grid. Timeframe tabs (`1W`-`5Y`) switch
the window; each card shows **value + 1D change + window change + sparkline**.
Group tabs above the grid come from the connectors themselves.

The widget has **no hardcoded indicator list**. It renders whatever `series`
connectors are enabled in `connectors.json`, so adding an indicator is a config
change, not a code change. See `docs/spec/connector-protocol.md`.

## Setup

Data sources are declared as connectors. A default set (FRED rates, dollar, and
volatility series) is seeded on first run; those need a FRED credential:

1. Get a free key at https://fredaccount.stlouisfed.org/apikey
2. Settings → Data sources → Credentials → Add: name `fred`, host
   `api.stlouisfed.org`, paste the key

Add other sources from Settings, or with `dyd source add` from a terminal.

## Data flow

```
Store.fetchAll()
  → window.marketAPI.connectors.list()          // which sources exist
  → window.marketAPI.connectors.fetchSeries(ids, 1300)
  → ipcMain "connectors:fetchSeries"            // src/main/connectors/ipc.ts
  → runtime.fetchSeries()                       // cache + per-host concurrency
  → fetcher.executeConnector()                  // URL build, auth, limits
```

Fetches 1300 points (~5 years of business days) per indicator in one shot;
switching timeframe tabs is instant local slicing (`getTimeframeWindow`).

Each connector settles independently: a source that fails renders its error on
its own card while the rest of the grid stays live.

## Structure

```
macro-indicators/
├── index.ts / client.ts            defineWidget + re-export
├── model/
│   ├── macro-indicators.types.ts   State / Actions / Config
│   ├── timeframe.ts                Timeframe + getTimeframeWindow()
│   └── use-macro-indicators-store.ts  Zustand store (persist v3)
└── ui/
    ├── MacroIndicatorsClient.tsx   header + group tabs + card grid
    ├── IndicatorCard.tsx           value + dual delta + sparkline
    └── Sparkline.tsx               Recharts LineChart wrapper
```

## Cache & state

localStorage persist (v3), 6-hour staleness → auto refetch on mount. Manual
refresh always available. Timeframe and the selected group tab persist. The
connector list is re-read on every fetch, so sources added elsewhere (dyd,
Settings) appear without a restart.

## Extending

- **Add an indicator**: `dyd source add` or Settings → Data sources → Add. No
  code change. Group it under a new `group` value to get a new tab.
- **Presentation**: a connector's `display.unit` / `display.fractionDigits`
  drive formatting in `IndicatorCard`
- **Time series types**: shared `SeriesPoint` / `SeriesSnapshot` in
  `src/entities/market-indicator/`
