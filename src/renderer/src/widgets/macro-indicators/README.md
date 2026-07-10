# Macro Indicators Widget

Shows 6 FRED-sourced macro indicators as a card grid. Timeframe tabs (`1W`-`5Y`)
switch the window; each card shows **value + 1D change + window change + sparkline**.

## Indicators

| Series | Label | Meaning |
|---|---|---|
| `DGS10` | 10Y UST | 10-year US Treasury yield |
| `DGS2` | 2Y UST | 2-year US Treasury yield |
| `DFF` | Fed Funds | Effective federal funds rate |
| `DTWEXBGS` | DXY | Broad dollar index |
| `VIXCLS` | VIX | Volatility (fear) index |
| `DEXKOUS` | USD/KRW | Won-dollar exchange rate |

## Setup

Set `MAIN_VITE_FRED_API_KEY=<key>` in `.env`. Free key:
https://fredaccount.stlouisfed.org/apikey

## Data flow

```
Store.fetchAll()
  → window.marketAPI.fred.getMany(ids, 1300)   // preload bridge
  → ipcMain "market:fred:getMany"              // src/main/market/ipc.ts
  → fetchManySeries()                           // src/main/market/fred-client.ts
  → FRED api.stlouisfed.org/fred/series/observations
```

Fetches 1300 business days (~5 years) per indicator in one shot; switching tabs
is instant local slicing (`getTimeframeWindow`).

## Structure

```
macro-indicators/
├── index.ts / client.ts            defineWidget + re-export
├── model/
│   ├── macro-indicators.types.ts   State / Actions / Config
│   ├── indicators-catalog.ts       metadata for the 6 indicators
│   ├── timeframe.ts                Timeframe + getTimeframeWindow()
│   └── use-macro-indicators-store.ts  Zustand store (persist v2)
└── ui/
    ├── MacroIndicatorsClient.tsx   header (tabs + refresh) + card grid
    ├── IndicatorCard.tsx           value + dual delta + sparkline
    └── Sparkline.tsx               Recharts LineChart wrapper
```

## Cache & state

localStorage persist (v2), 6-hour staleness → auto refetch on mount. Manual
refresh button always available. The selected timeframe persists too.

## Extending

- **Add an indicator**: one more entry in `MACRO_INDICATORS` in
  `indicators-catalog.ts` (adjust `grid-cols-*` beyond 6 cards)
- **Other FRED widgets**: reuse `src/main/market/` + `window.marketAPI.fred` as-is
- **Time series types**: shared `SeriesPoint` / `SeriesSnapshot` in
  `src/entities/market-indicator/`
