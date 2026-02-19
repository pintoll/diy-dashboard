# Daily News Pipeline Architecture

n8n + PostgreSQL 기반 개인화 뉴스 파이프라인.

## Overview

```
n8n (VPS: pintomate.duckdns.org)
┌──────────────┐   ┌───────────────┐   ┌──────────────┐
│ Pipeline A   │──▶│ PostgreSQL    │◀──│ Serve Daily  │
│ (Daily Cron) │   │ (Docker)      │   │ News (GET)   │
└──────────────┘   └───────┬───────┘   └──────▲───────┘
                           │                   │
                   ┌───────┴───────┐           │
                   │               │    Electron Widget
            ┌──────┴──────┐  ┌────┴────────┐  (fetch)
            │ Pipeline B  │  │ Pipeline C  │
            │ (Webhook)   │  │ (Weekly)    │
            └─────▲───────┘  └─────────────┘
                  │
           Electron Widget
           (👍/👎 feedback)
```

## Current State (Implemented)

### Pipeline A — Daily Ingestion (Cron, 매일 05:00 KST)

```
Schedule Trigger
  → Edit Fields [{category, source, url}...]
  → Split Out
  → RSS Read ({{ $json.url }})
  → Edit Fields (Attach Meta: category/source from Split Out)
  → Code: Clean & Dedup
  → Code: Build Batch Prompt (15개씩)
  → HTTP Request: Gemini Flash (scoring)
  → Code: Parse & Score (relevance × 0.7 + importance × 0.3)
  → IF: include = true
  → Code: Format Response
  → Postgres: INSERT INTO articles
```

**Manual trigger**: `POST https://pintomate.duckdns.org/webhook/daily-news-run`

### Serve Daily News (Separate Workflow)

```
Webhook (GET /daily-news)
  → Postgres: SELECT * FROM articles WHERE fetched_date = CURRENT_DATE
  → Code: Format for Widget (category→topic mapping, score×10)
  → Response (When Last Node Finishes)
```

**Endpoint**: `https://pintomate.duckdns.org/webhook/daily-news`

### Scoring Formula

```
Final_Score = (relevance × 0.7) + (importance × 0.3)
```

- `relevance` (0-10): LLM이 판단한 사용자 관심사 관련도
- `importance` (0-10): LLM이 판단한 업계/사회적 객관적 중요도
- Bypass: `importance >= 9` → 점수 무관 자동 포함
- Serendipity: 탈락 기사 중 랜덤 1~2개 부활
- Threshold: `Final_Score >= 4.5`

### LLM Prompt (Gemini Flash)

System instruction에 두 가지 프로필 포함:
- **Core Interests**: 장기 관심사 (사용자 직접 관리)
- **Short-term Interests**: 단기 관심사 (Pipeline C가 주간 업데이트)

프로필은 `user_profile` 테이블에서 읽어옴.

## Database Schema (PostgreSQL, Docker)

```
Host: postgres (docker internal) / localhost:5432 (external)
DB: dashboard, User: dashboard

articles
├── id            SERIAL PRIMARY KEY
├── title         TEXT NOT NULL
├── summary       TEXT
├── url           TEXT UNIQUE NOT NULL
├── source        TEXT
├── category      TEXT            ← "tech", "finance", "growth", "world"
├── published_at  TIMESTAMP
├── relevance     INTEGER         ← 0-10
├── importance    INTEGER         ← 0-10
├── final_score   REAL            ← weighted sum (0-10)
├── tag           TEXT            ← "relevant", "bypass", "serendipity"
├── fetched_date  DATE DEFAULT CURRENT_DATE
└── created_at    TIMESTAMP DEFAULT NOW()

feedback
├── id            SERIAL PRIMARY KEY
├── article_id    INTEGER REFERENCES articles(id)
├── action        TEXT NOT NULL   ← "like" / "dislike"
└── created_at    TIMESTAMP DEFAULT NOW()

user_profile
├── id            SERIAL PRIMARY KEY
├── profile_type  TEXT UNIQUE NOT NULL  ← "core" / "short_term"
├── content       TEXT NOT NULL         ← LLM 프롬프트에 주입되는 텍스트
└── updated_at    TIMESTAMP DEFAULT NOW()
```

## TODO: Pipeline B — Feedback Loop (Webhook, 실시간)

### n8n Workflow

```
Webhook (POST /daily-news-feedback)
  → Code: Validate payload
  → Postgres: INSERT INTO feedback (article_id, action)
  → Respond to Webhook (200 OK)

※ tag="bypass" 기사의 피드백은 프로필 학습에서 제외
```

### Frontend Changes

`NewsItem` 컴포넌트에 피드백 버튼 추가:

```typescript
// daily-news.types.ts — 추가 필드
export type NewsItem = {
  // ... 기존 필드
  tag?: "bypass" | "relevant" | "serendipity";
  importance?: number;
};

// NewsItem.tsx — 👍/👎 버튼 추가
// POST to: https://pintomate.duckdns.org/webhook/daily-news-feedback
// Body: { articleId: number, action: "like" | "dislike" }
```

### API Contract

```
POST /webhook/daily-news-feedback
Content-Type: application/json

{ "articleId": 42, "action": "like" }

→ 200 OK
```

## TODO: Pipeline C — Weekly Profile Update (Cron, 주 1회)

### n8n Workflow

```
Schedule Trigger (매주 일요일)
  → Postgres: SELECT 최근 1주 피드백 + 기사 제목
  → Code: Build prompt for LLM
  → HTTP Request: LLM에게 "이 피드백 기반으로 단기 관심사 업데이트해줘"
  → Postgres: UPDATE user_profile SET content = ... WHERE profile_type = 'short_term'
```

### Query for Feedback Summary

```sql
SELECT a.title, a.category, f.action
FROM feedback f
JOIN articles a ON f.article_id = a.id
WHERE f.created_at > NOW() - INTERVAL '7 days'
  AND a.tag != 'bypass'
ORDER BY f.created_at DESC;
```

### LLM Prompt

```
Based on the user's recent feedback:

Liked articles:
- [titles...]

Disliked articles:
- [titles...]

Current short-term interests: "..."

Rewrite the short-term interests as a concise 2-3 sentence description
reflecting what the user is currently interested in.
```

## RSS Sources

```json
[
  { "category": "tech",    "source": "Hacker News",   "url": "https://hnrss.org/best" },
  { "category": "finance", "source": "Yahoo Finance", "url": "https://finance.yahoo.com/news/rssindex" },
  { "category": "growth",  "source": "James Clear",   "url": "https://jamesclear.com/feed" },
  { "category": "world",   "source": "BBC World",     "url": "https://feeds.bbci.co.uk/news/world/rss.xml" }
]
```

n8n Edit Fields에서 관리. 소스 추가 시 배열에 항목만 추가하면 됨.

## Cost

- Gemini Flash: 무료 티어 (15 RPM, 1M TPD)
- Fallback: GPT-4o-mini (~$0.10/월)
- PostgreSQL: self-hosted (Docker, 무료)
- 총 예상 비용: **$0 ~ $0.10/월**
