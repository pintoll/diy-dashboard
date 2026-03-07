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

interest_signals                        ← Pipeline C signal accumulation
├── id            SERIAL PRIMARY KEY
├── topic         TEXT UNIQUE NOT NULL  ← "rust-lang", "llm-agents", etc.
├── category      TEXT                  ← "tech", "finance", "growth", "world"
├── score         REAL DEFAULT 0        ← 축적값 (like +1, dislike -1, weekly ×0.9 decay)
├── hit_count     INTEGER DEFAULT 0     ← 총 피드백 횟수
├── last_seen     DATE DEFAULT CURRENT_DATE
└── created_at    TIMESTAMP DEFAULT NOW()
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

Signal accumulation 기반 점진적 프로필 업데이트.
피드백을 직접 프로필에 반영하지 않고, `interest_signals` 테이블에 신호를 축적한 뒤
임계값을 넘은 안정적인 신호만 프로필에 반영한다.

### interest_signals 테이블

```sql
CREATE TABLE interest_signals (
  id          SERIAL PRIMARY KEY,
  topic       TEXT UNIQUE NOT NULL,   -- "rust-lang", "llm-agents", "macro-economy"
  category    TEXT,                   -- "tech", "finance", "growth", "world"
  score       REAL DEFAULT 0,        -- 축적값: like +1 / dislike -1, 매주 decay
  hit_count   INTEGER DEFAULT 0,     -- 총 피드백 횟수
  last_seen   DATE DEFAULT CURRENT_DATE,
  created_at  TIMESTAMP DEFAULT NOW()
);
```

### Signal 축적 흐름

```
Week 1: "Rust async runtime" 기사 like
  → topic "rust-lang" 추출, score = +1.0

Week 2: "Rust in Linux kernel" 기사 like
  → decay: 1.0 × 0.9 = 0.9, then +1 → score = 1.9

Week 3: rust 관련 피드백 없음
  → decay: 1.9 × 0.9 = 1.71 (서서히 감소)

Week 4: "Rust GUI frameworks" 기사 like
  → decay: 1.71 × 0.9 = 1.54, then +1 → score = 2.54 ← 임계값 초과!
```

- **프로필 반영 조건**: `score >= 2.0` AND `hit_count >= 2`
- 일회성 클릭은 프로필에 도달하지 않음
- 꾸준한 관심사만 2~3주에 걸쳐 축적됨
- 무시된 토픽은 자연스럽게 0으로 감소

### n8n Workflow

```
Schedule Trigger (매주 일요일)

  ── Stage 1: Extract Signals ──
  → Postgres: SELECT 최근 7일 피드백 + 기사 제목/카테고리 (bypass 제외)
  → Code: Build extraction prompt
  → HTTP Request: LLM에게 "이 기사들에서 토픽 키워드 추출해줘"
  → Code: Parse LLM response → [{ topic, category, direction }]

  ── Stage 2: Update Signal Table ──
  → Postgres: 전체 signal decay (UPDATE interest_signals SET score = score * 0.9)
  → Code: Build UPSERT queries
  → Postgres: UPSERT each signal (like → +1, dislike → -1, hit_count++, last_seen 갱신)

  ── Stage 3: Synthesize Profile ──
  → Postgres: SELECT * FROM interest_signals WHERE score >= 2.0 AND hit_count >= 2
  → Postgres: SELECT content FROM user_profile WHERE profile_type = 'short_term'
  → Code: Build synthesis prompt (stable signals + current profile)
  → HTTP Request: LLM에게 "이 안정적인 신호 기반으로 단기 관심사 합성해줘"
  → Postgres: UPDATE user_profile SET content = ... WHERE profile_type = 'short_term'
```

### Stage 1 Query — 주간 피드백 수집

```sql
SELECT a.title, a.category, f.action
FROM feedback f
JOIN articles a ON f.article_id = a.id
WHERE f.created_at > NOW() - INTERVAL '7 days'
  AND a.tag != 'bypass'
ORDER BY f.created_at DESC;
```

### Stage 2 Queries — Signal Decay & Upsert

```sql
-- 매주 실행: 전체 decay 적용
UPDATE interest_signals SET score = score * 0.9;

-- 각 추출된 signal에 대해 UPSERT
INSERT INTO interest_signals (topic, category, score, hit_count, last_seen)
VALUES ($1, $2, $3, 1, CURRENT_DATE)
ON CONFLICT (topic) DO UPDATE SET
  score = interest_signals.score + $3,
  hit_count = interest_signals.hit_count + 1,
  category = COALESCE($2, interest_signals.category),
  last_seen = CURRENT_DATE;
-- $3: like → +1.0, dislike → -1.0
```

### Stage 1 LLM Prompt — Topic 추출

```
Given these articles the user interacted with this week:

Liked:
- "Rust async runtime deep dive" (tech)
- "S&P 500 hits all-time high" (finance)

Disliked:
- "Top 10 crypto coins for 2026" (finance)

Extract the key topic keywords from each article.
Return a JSON array:
[
  { "topic": "rust-lang", "category": "tech", "direction": "like" },
  { "topic": "us-stock-market", "category": "finance", "direction": "like" },
  { "topic": "cryptocurrency", "category": "finance", "direction": "dislike" }
]

Rules:
- Use lowercase kebab-case for topic names
- Be specific but not too granular (e.g., "rust-lang" not "rust-async-runtime")
- One topic per article, pick the most representative keyword
- direction must match the user's feedback action
```

### Stage 3 LLM Prompt — Profile 합성

```
These are the user's confirmed interest signals that passed the stability threshold
(score >= 2.0, seen at least twice):

- rust-lang (tech): score 3.2, seen 5 times
- macro-economy (finance): score 2.4, seen 3 times
- llm-agents (tech): score 2.1, seen 2 times

Current short-term interests:
"Interested in systems programming with Rust and macroeconomic trends..."

Rewrite the short-term interests incorporating these stable signals.
Rules:
- Only reflect topics present in the signal data above
- Remove topics no longer in the signal list
- Keep the tone concise (2-3 sentences)
- Do NOT invent interests that aren't backed by signals
```

## Profile Management

### Update Core Profile (n8n Manual Workflow)

Core 프로필은 n8n UI에서 직접 수정. 외부 API 노출 없이 n8n 내부에서 관리.

```
Manual Trigger (n8n UI에서 실행)
  → Edit Fields (content: "수정할 프로필 텍스트 직접 입력")
  → Postgres: UPDATE user_profile
              SET content = {{ $json.content }}, updated_at = NOW()
              WHERE profile_type = 'core'
```

- n8n UI에서 워크플로우 열고 Edit Fields의 content 값을 수정 후 실행
- Short-term 프로필은 Pipeline C가 자동 관리하므로 별도 수정 불필요

### Serve Profile (Webhook GET)

Widget에서 현재 프로필 상태를 조회 (읽기 전용).

```
Webhook (GET /profile)
  → Postgres: SELECT profile_type, content, updated_at FROM user_profile ORDER BY id
  → Code: Format Response
  → Respond to Webhook (200 OK)
```

**Endpoint**: `GET https://pintomate.duckdns.org/webhook/profile`

**Response**:

```json
{
  "core": {
    "content": "Frontend developer interested in React, TypeScript...",
    "updatedAt": "2026-03-01T12:00:00Z"
  },
  "shortTerm": {
    "content": "Recently exploring Rust async runtime and macro-economy...",
    "updatedAt": "2026-03-05T09:00:00Z"
  }
}
```

### n8n Code Node — Format GET Response

```javascript
const rows = $input.all();
const result = {};
for (const row of rows) {
  const type = row.json.profile_type;
  const key = type === 'short_term' ? 'shortTerm' : type;
  result[key] = {
    content: row.json.content,
    updatedAt: row.json.updated_at
  };
}
return [{ json: result }];
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
