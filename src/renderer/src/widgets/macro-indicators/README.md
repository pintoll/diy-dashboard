# Macro Indicators Widget

FRED API 기반 매크로 지표 6개를 카드 그리드로 표시. 타임프레임 탭(`1W`~`5Y`)으로 기간 전환, 각 카드는 **값 + 1D 변화 + 기간 변화 + 스파크라인** 구성.

## 지표

| Series | Label | 의미 |
|---|---|---|
| `DGS10` | 10Y UST | 10년 미국채 수익률 |
| `DGS2` | 2Y UST | 2년 미국채 수익률 |
| `DFF` | Fed Funds | 연방기금 유효금리 |
| `DTWEXBGS` | DXY | 광의 달러지수 |
| `VIXCLS` | VIX | 변동성(공포)지수 |
| `DEXKOUS` | USD/KRW | 원달러 환율 |

## 설정

`.env`에 `MAIN_VITE_FRED_API_KEY=<키>`. 무료 키: https://fredaccount.stlouisfed.org/apikey

## 데이터 흐름

```
Store.fetchAll()
  → window.marketAPI.fred.getMany(ids, 1300)   // preload bridge
  → ipcMain "market:fred:getMany"              // src/main/market/ipc.ts
  → fetchManySeries()                           // src/main/market/fred-client.ts
  → FRED api.stlouisfed.org/fred/series/observations
```

지표당 1300 영업일(~5년)을 한 번 페치 → 탭 전환은 로컬 슬라이싱(`getTimeframeWindow`)으로 즉시 처리.

## 구조

```
macro-indicators/
├── index.ts / client.ts            defineWidget + re-export
├── model/
│   ├── macro-indicators.types.ts   State / Actions / Config
│   ├── indicators-catalog.ts       6개 지표 메타
│   ├── timeframe.ts                Timeframe + getTimeframeWindow()
│   └── use-macro-indicators-store.ts  Zustand store (persist v2)
└── ui/
    ├── MacroIndicatorsClient.tsx   헤더(탭+refresh) + 카드 그리드
    ├── IndicatorCard.tsx           값 + 듀얼 델타 + 스파크라인
    └── Sparkline.tsx               Recharts LineChart 래퍼
```

## 캐시 & 상태

localStorage persist(v2), 6시간 stale → 마운트 시 자동 재페치. 수동 refresh 버튼 상시 가용. 선택 타임프레임도 persist.

## 확장

- **지표 추가**: `indicators-catalog.ts`의 `MACRO_INDICATORS`에 한 줄 추가 (카드 7개 이상이면 `grid-cols-*` 조정)
- **다른 FRED 위젯**: `src/main/market/` + `window.marketAPI.fred` 그대로 재사용
- **시계열 타입**: `src/entities/market-indicator/`의 `SeriesPoint` / `SeriesSnapshot` 공용
