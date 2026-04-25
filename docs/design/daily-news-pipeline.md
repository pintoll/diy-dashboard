# Daily News Pipeline Architecture

Personalized news pipeline built on n8n + PostgreSQL. **This file documents only what is implemented**; planned work is tracked in [`wip/daily-news.md`](../wip/daily-news.md), and external API contracts in [`spec/daily-news-api.md`](../spec/daily-news-api.md).

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

Pipeline B (feedback collection) and C (weekly profile update) are not implemented — tracked in `wip/daily-news.md`.

## Pipeline A — Daily Ingestion (cron, 05:00 KST)

```
Schedule Trigger
  → Edit Fields [{category, source, url}...]
  → Split Out
  → RSS Read ({{ $json.url }})
  → Edit Fields (Attach Meta: category/source from Split Out)
  → Code: Clean & Dedup
  → Code: Build Batch Prompt (15 articles per batch)
  → HTTP Request: Gemini Flash (scoring)
  → Code: Parse & Score (relevance × 0.7 + importance × 0.3)
  → IF: include = true
  → Code: Format Response
  → Postgres: INSERT INTO articles
```

**Manual trigger**: `POST https://pintomate.duckdns.org/webhook/daily-news-run`

## Scoring Formula

```
Final_Score = (relevance × 0.7) + (importance × 0.3)
```

- `relevance` (0–10): LLM-judged relevance to the user's interests
- `importance` (0–10): LLM-judged objective importance (industry/society)
- Bypass: `importance >= 9` is auto-included regardless of score
- Serendipity: 1–2 random rejected articles get revived
- Threshold: `Final_Score >= 4.5`

## LLM Prompt (Gemini Flash)

The system instruction injects two profiles:
- **Core Interests**: long-term, manually curated by the user
- **Short-term Interests**: weekly-updated by Pipeline C (not yet implemented)

Profiles are read from the `user_profile` table.

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
├── relevance     INTEGER         ← 0–10
├── importance    INTEGER         ← 0–10
├── final_score   REAL            ← weighted sum (0–10)
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
├── content       TEXT NOT NULL         ← injected into the LLM prompt
└── updated_at    TIMESTAMP DEFAULT NOW()

interest_signals                        ← Pipeline C signal store (schema only, unused)
├── id            SERIAL PRIMARY KEY
├── topic         TEXT UNIQUE NOT NULL  ← "rust-lang", "llm-agents", etc.
├── category      TEXT                  ← "tech", "finance", "growth", "world"
├── score         REAL DEFAULT 0        ← accumulated (like +1, dislike -1, weekly ×0.9 decay)
├── hit_count     INTEGER DEFAULT 0     ← total feedback events
├── last_seen     DATE DEFAULT CURRENT_DATE
└── created_at    TIMESTAMP DEFAULT NOW()
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

Managed inside the n8n Edit Fields node. Add a source by appending to the array.

## Profile Management — Core Profile (n8n manual workflow)

The core profile is edited directly in the n8n UI. No external endpoint exposes it; management stays inside n8n.

```
Manual Trigger (run from the n8n UI)
  → Edit Fields (content: "new profile text here")
  → Postgres: UPDATE user_profile
              SET content = {{ $json.content }}, updated_at = NOW()
              WHERE profile_type = 'core'
```

Open the workflow in n8n, edit the `content` field, and run it. The short-term profile will be managed automatically by Pipeline C once that ships.

## Cost

- Gemini Flash: free tier (15 RPM, 1M TPD)
- Fallback: GPT-4o-mini (~$0.10/month)
- PostgreSQL: self-hosted (Docker, free)
- Estimated total: **$0 – $0.10/month**
