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

## TODO: Widget 2 — Economic Calendar 🚧

매크로 지표의 "시간 축 파트너". 언제 무슨 지표·이벤트가 발표되는지 + 예상치·실제치.

### 목표

```
┌─ Economic Calendar ───────── [This Week] [Next Week] ┐
│ 2026-04-23  Thu  15:30 KST                           │
│   🇺🇸 GDP Advance QoQ    exp: 2.1%  prev: 3.2%  ★★★ │
│   🇺🇸 Jobless Claims      exp: 215K  prev: 212K  ★★  │
│ 2026-04-24  Fri                                       │
│   🇰🇷 한은 금통위          exp: 3.25% prev: 3.25% ★★★│
│   🇺🇸 Core PCE YoY        exp: 2.7%  prev: 2.8%  ★★★ │
└───────────────────────────────────────────────────────┘
```

### Data Sources

- **Financial Modeling Prep (FMP)** — 무료 250 req/day
  - `GET /api/v3/economic_calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`
  - 예상치·실제치·국가·영향도 포함
- **한은 금통위 일정** — 연초 고정 공개 → YAML 또는 하드코딩
- 일 1~2회 페치면 충분

### New files

```
src/main/market/
├── fmp-client.ts              FMP API 래퍼
└── ipc.ts                     market:fmp:calendar 핸들러 추가
src/preload/index.ts           marketAPI.fmp.calendar 노출
src/renderer/src/entities/
└── economic-event/            EconomicEvent 타입, 국가 플래그 매핑
src/renderer/src/widgets/
└── economic-calendar/
    ├── index.ts / client.ts
    ├── model/{types,use-calendar-store}.ts
    └── ui/{CalendarClient,DayGroup,EventRow}.tsx
```

### 설정

`.env`에 `MAIN_VITE_FMP_API_KEY` 추가.

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

1. **ECOS 확장** (1~2h) — 매크로 위젯을 한국 투자자용으로 완성
2. **Economic Calendar** (반나절~하루) — 매크로 지표와 시너지, 인프라 재사용
3. **Watchlist** (하루~이틀) — 사용자가 실제 매수 단계 진입 시점에 맞춰 (현재는 관찰 단계)

## Cost

| 소스 | 제한 | 비용 |
|---|---|---|
| FRED | 120 req/min | 무료 |
| FMP | 250 req/day | 무료 |
| Yahoo Finance | 비공식, 적정 사용 | 무료 |
| ECOS | 사용량 제한 있음 | 무료 |

**총 예상 비용: $0/월**

## 공통 원칙

- API 키는 **메인 프로세스 전용**. `MAIN_VITE_*` prefix로 electron-vite 주입, 렌더러 번들에 포함 금지
- 외부 HTTP는 **메인 프로세스 IPC 핸들러 경유** — CORS 우회 + 키 보호
- 금융 데이터는 **로컬 캐시 + persist** — API 쿼터 절약, 재시작 즉시 표시
- 시계열은 `entities/market-indicator` 공용 타입 사용 — 위젯 간 일관성
- IPC 채널 네이밍: `market:<source>:<action>` (예: `market:fred:getMany`, `market:fmp:calendar`)
