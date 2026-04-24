# Market Analysis Widgets

개인 투자 감각 구축을 위한 금융 위젯 시리즈. **매크로 중심 + 장기 적립** 투자 철학 기반. 데이트레이딩·호가창 스캐너는 범위 밖.

## Overview

```
Electron Renderer
┌──────────────────────────────────────────────────────────┐
│  [Macro Indicators]   [Econ Calendar]   [Watchlist]      │
│     ✅ done              🚧 next           🚧 next        │
└──────────────────────────┬───────────────────────────────┘
                           │ IPC (window.marketAPI)
                           ▼
                 ┌─────────────────────┐
                 │  src/main/market/   │
                 │  ├─ fred-client ✅  │
                 │  ├─ fmp-client  🚧  │
                 │  ├─ yahoo-client 🚧 │
                 │  └─ ecos-client 🚧  │
                 └──────────┬──────────┘
                            │ HTTPS
                            ▼
         FRED · FMP · Yahoo Finance · ECOS
```

## Current State

### Widget 1 — Macro Indicators ✅

상세: [`src/renderer/src/widgets/macro-indicators/README.md`](../src/renderer/src/widgets/macro-indicators/README.md)

요약:
- 6개 FRED 지표 (10Y/2Y UST, Fed Funds, DXY, VIX, USD/KRW)
- 타임프레임 탭 (1W~5Y), 값 + 1D 변화 + 기간 변화 + 스파크라인
- localStorage persist(v2) + 6시간 stale 자동 재페치

### 이미 구축된 재사용 인프라

| 자산 | 위치 | 다음 위젯에서 활용 |
|---|---|---|
| 외부 API 클라이언트 슬롯 | `src/main/market/` | 새 데이터 소스 추가 시 같은 위치 |
| Preload 브리지 | `src/preload/index.ts` `marketAPI` | 새 메서드 얹어서 확장 |
| 시계열 공용 타입 | `src/entities/market-indicator/` | `SeriesPoint`, `SeriesSnapshot` 재사용 |
| 차트 스택 | Recharts (`Sparkline.tsx` 패턴) | 관심종목 스파크라인, 수익률 곡선 |
| API 키 관리 규약 | `.env` + `MAIN_VITE_*` | 새 API 키 추가 시 동일 패턴 |
| IPC 네이밍 | `market:<source>:<action>` | 일관된 채널 네임스페이스 |

## Widget 2 — Economic Calendar 🚧 (Phase 1 구현 완료)

매크로 지표의 "시간 축 파트너". 언제 무슨 지표가 발표되는지를 한눈에. **증분 확장 전제**로 설계 — Phase 1은 FRED 릴리스 일정만, 이후 어닝·공시를 같은 캘린더에 섞는다.

**설계 철학**: 예상치·컨센서스 같은 가공된 시장 의견은 유료 API 영역이고, 투자 판단은 사용자 본인의 리서치 몫. 위젯은 "언제 발표되는지" raw fact만 제공해서 리서치 진입 장벽을 낮춘다.

### 목표

```
┌─ Economic Calendar ─ [All] [Macro] [Earnings] [Filings] ─ [This Week] [Next Week] ┐
│ Apr 23 · Thu                                                                      │
│   🇺🇸  CPI                                                     ★★★              │
│   🇺🇸  Producer Price Index                                    ★★               │
│ Apr 24 · Fri                                                                      │
│   🇺🇸  Personal Income & Outlays (PCE)                         ★★★              │
│   🇺🇸  Industrial Production                                   ★★               │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### 이벤트 타입 (Discriminated Union)

```ts
type CalendarEvent =
  | { kind: "macro";   country, name, releaseId?, expected?, previous?, actual?, unit? }
  | { kind: "earning"; ticker, companyName, timing: "BMO"|"AMC", epsExpected, epsActual }
  | { kind: "filing";  ticker, formType: "10-K"|"10-Q"|"8-K"|...; title, url }
```

세 타입 모두 `{ id, datetime, kind, country, importance }` 공통 필드 공유 → 같은 `EventRow`에서 렌더, `kind`별 분기. Phase 1은 `macro` 브랜치만 활성.

### Data Sources (Phase별)

| Phase | 소스 | 커버 | API | 키 |
|---|---|---|---|---|
| **1** ✅ | FRED `/release/dates` | 미국 주요 매크로 릴리스 일정 (CPI, NFP, GDP, PCE, PPI, IP 등 ~6개) | 120 req/min, 무료 | 기존 `MAIN_VITE_FRED_API_KEY` 재사용 |
| 1.5 (선택) | 한은 금통위 일정 | 한국 금리 결정일 | 하드코딩 YAML (연초 공개) | — |
| 2 | Trading Economics guest 또는 유료 FMP/Finnhub | 예상치·컨센서스·실제치 추가 | 유료 검토 시점에 | TBD |
| 2 | FMP `/stable/earnings-calendar` 또는 대체 | 미국 상장사 어닝 | 유료 | TBD |
| 3 | SEC EDGAR | 미국 10-K/10-Q/8-K/Form 4 | 무료, 키 불필요 | — |
| 3 | OPEN DART | 한국 공시 (사업보고서, 주요사항보고서 등) | 무료 | `MAIN_VITE_DART_API_KEY` |

**Phase 1 한계**: FRED 릴리스는 date만 주고 time은 없음 → UI는 date-only 표시. 예상치·실제치·컨센서스 없음. US 릴리스만. 본인 리서치로 보완하는 전제.

### 구현된 파일 구조

```
src/main/market/
├── fred-client.ts             fetchSeries, fetchManySeries, fetchReleaseDates
└── ipc.ts                     market:fred:{getSeries,getMany,getReleaseDates}
src/preload/index.ts           marketAPI.fred.getReleaseDates 노출
src/renderer/src/entities/
└── calendar-event/            CalendarEvent 유니언, COUNTRY_LABEL, normalizeCountry
src/renderer/src/widgets/
└── economic-calendar/
    ├── index.ts / client.ts
    ├── model/
    │   ├── economic-calendar.types.ts
    │   ├── range.ts                     KST 기준 주 범위·fetch 윈도우
    │   ├── filters.ts                   필터·day grouping
    │   ├── releases-catalog.ts          curated FRED release IDs
    │   └── use-economic-calendar-store.ts
    └── ui/{EconomicCalendarClient, DayGroup, EventRow, RangeSelector, TypeFilter, ImportanceFilter}.tsx
```

### 다음 단계 (Phase 2/3)

- **예상치·컨센서스 덧붙이기** — 본인이 유료 구독 의지 생기는 시점에. 현재 위젯에 드롭인 가능 (entity 타입이 이미 optional 필드 보유)
- **Earnings 탭** — Watchlist 완성 + 유료 소스 결정 후
- **Filings 탭** — 특정 회사에 관심 생긴 시점 (SEC EDGAR 무료, DART 무료)

## TODO: Widget 3 — Watchlist + Indices 🚧

실제 종목·지수·코인 가격. **사용자 지정 티커 관리 UI** 필요한 첫 위젯.

### 목표

```
┌─ Watchlist ─────────────────────────── [+ Add] ┐
│ Indices                                        │
│   ^GSPC   S&P 500      5,820.2   +0.35% ▲     │
│   ^KS11   KOSPI        2,680     -0.18% ▼     │
│ Crypto                                         │
│   BTC-USD Bitcoin      68,200    +1.2%  ▲     │
│ Stocks                                         │
│   NVDA    NVIDIA       142.3     +2.1%  ▲     │
│   005930.KS 삼성전자    72,400    -0.4%  ▼    │
└────────────────────────────────────────────────┘
```

### Data Sources

- **Yahoo Finance** (`yahoo-finance2` npm) — 무료, 비공식
  - 커버리지: 미국/한국 주식, 지수(`^GSPC`, `^KS11`), 크립토(`BTC-USD`)
  - 한국 티커 suffix: 코스피 `.KS`, 코스닥 `.KQ`
- **CoinGecko** — 크립토 온체인 지표 필요 시 (funding rate, exchange netflow 등)

### 기능 범위

- **섹션 그룹핑**: 지수 / 크립토 / 국내주식 / 해외주식
- **티커 추가·삭제**: 설정 다이얼로그 (FSD features 레이어)
- **티커별 미니 스파크라인**: 기본 1W
- **클릭 시 상세 모달**: 긴 기간 차트 (1M/3M/1Y)
- **장중 자동 갱신**: 5분 주기 옵션 (기본 꺼짐)

### New files

```
src/main/market/
├── yahoo-client.ts            yahoo-finance2 래퍼
└── ipc.ts                     market:yahoo:{quote,chart}
src/preload/index.ts           marketAPI.yahoo.*
src/renderer/src/entities/
└── ticker/                    Ticker, Quote 타입
src/renderer/src/features/
└── manage-watchlist-ticker/   추가·삭제 액션 + 다이얼로그
src/renderer/src/widgets/
└── watchlist/
```

## Optional — ECOS 확장 (소규모)

매크로 위젯에 한국 특화 지표 2~3개 **추가**. 독립 위젯 아님, 기존 확장.

- 한국은행 기준금리, 한국 CPI, M2 통화량
- **Source**: 한국은행 ECOS API (`https://ecos.bok.or.kr/api/`, 무료)
- **변경 범위**:
  - `src/main/market/ecos-client.ts` 추가
  - `ipc.ts`에 `market:ecos:series` 핸들러
  - `indicators-catalog.ts`에 `source: "fred" | "ecos"` 필드 도입
  - `fetchAll()`이 source에 따라 클라이언트 분기

## Roadmap 순서 권장

1. **Economic Calendar — Phase 1** ✅ — FRED 릴리스 스케줄 (구현 완료)
2. **ECOS 확장** (1~2h) — 매크로 위젯에 한국 지표 추가 (기준금리, 한국 CPI, M2)
3. **Watchlist + Indices** (하루~이틀) — 실제 매수 단계 진입 시점에 맞춰
4. **Economic Calendar — Phase 2** — 예상치·실제치 보강 (유료 API 검토 시점) + 어닝 탭
5. **Economic Calendar — Phase 3** — EDGAR·DART 공시. 관심 회사 고정되면 착수

## Cost

| 소스 | 제한 | 비용 |
|---|---|---|
| FRED | 120 req/min | 무료 |
| ~~FMP~~ | ~~250 req/day~~ | ~~무료~~ (2025-08 기준 economic/earnings calendar는 유료 전환) |
| Yahoo Finance | 비공식, 적정 사용 | 무료 |
| ECOS | 사용량 제한 있음 | 무료 |
| SEC EDGAR | 10 req/sec, UA 헤더 필수 | 무료 |
| OPEN DART | 20,000 req/day | 무료 |
| Finnhub economic calendar | — | 유료 (Basic $59/월~) |

**총 예상 비용: $0/월**

## 공통 원칙

- API 키는 **메인 프로세스 전용**. `MAIN_VITE_*` prefix로 electron-vite 주입, 렌더러 번들에 포함 금지
- 외부 HTTP는 **메인 프로세스 IPC 핸들러 경유** — CORS 우회 + 키 보호
- 금융 데이터는 **로컬 캐시 + persist** — API 쿼터 절약, 재시작 즉시 표시
- 시계열은 `entities/market-indicator` 공용 타입 사용 — 위젯 간 일관성
- IPC 채널 네이밍: `market:<source>:<action>` (예: `market:fred:getMany`, `market:fmp:calendar`)
