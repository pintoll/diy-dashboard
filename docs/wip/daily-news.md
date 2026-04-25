# WIP — Daily News Pipeline B / C

Pipeline A (daily ingestion) and the serving endpoints are live. This file covers the two remaining pipelines.

Architecture context: [`design/daily-news-pipeline.md`](../design/daily-news-pipeline.md). External contracts: [`spec/daily-news-api.md`](../spec/daily-news-api.md).

## Pipeline B — Feedback Loop (webhook, real-time)

Article-card 👍/👎 → write to the `feedback` table. Pipeline C then reads from it weekly.

### n8n Workflow

```
Webhook (POST /daily-news-feedback)
  → Code: Validate payload
  → Postgres: INSERT INTO feedback (article_id, action)
  → Respond to Webhook (200 OK)

※ Feedback on tag="bypass" articles is stored but excluded from Pipeline C's learning stage.
```

### Frontend Changes

Add feedback buttons to the `NewsItem` component:

```typescript
// daily-news.types.ts — extra fields
export type NewsItem = {
  // ... existing fields
  tag?: "bypass" | "relevant" | "serendipity";
  importance?: number;
};

// NewsItem.tsx — 👍/👎 buttons
// POST → https://pintomate.duckdns.org/webhook/daily-news-feedback
// Body: { articleId: number, action: "like" | "dislike" }
```

Optimistic update (immediate visual feedback) with rollback on failure. Re-clicking the same article is ignored on the client; the server doesn't dedup, duplicate rows are allowed (the stats are aggregates, so impact is small).

## Pipeline C — Weekly Profile Update (cron, weekly)

Gradual profile updates driven by accumulated signals. Feedback doesn't go straight into the profile — it accumulates in `interest_signals`, and only signals that pass a stability threshold flow into the profile.

### Signal Accumulation Flow

```
Week 1: like "Rust async runtime"
  → topic "rust-lang", score = +1.0

Week 2: like "Rust in Linux kernel"
  → decay: 1.0 × 0.9 = 0.9, then +1 → score = 1.9

Week 3: no rust-related feedback
  → decay: 1.9 × 0.9 = 1.71

Week 4: like "Rust GUI frameworks"
  → decay: 1.71 × 0.9 = 1.54, then +1 → score = 2.54 ← crosses threshold
```

- **Profile-inclusion rule**: `score >= 2.0` AND `hit_count >= 2`
- One-off clicks never reach the profile
- Sustained interests build up over 2–3 weeks
- Ignored topics naturally decay toward 0

### n8n Workflow

```
Schedule Trigger (every Sunday)

  ── Stage 1: Extract Signals ──
  → Postgres: SELECT last 7 days of feedback + article title/category (excluding bypass)
  → Code: Build extraction prompt
  → HTTP Request: ask the LLM to extract topic keywords
  → Code: Parse LLM response → [{ topic, category, direction }]

  ── Stage 2: Update Signal Table ──
  → Postgres: global decay (UPDATE interest_signals SET score = score * 0.9)
  → Code: Build UPSERT queries
  → Postgres: UPSERT each signal (like → +1, dislike → -1, hit_count++, last_seen)

  ── Stage 3: Synthesize Profile ──
  → Postgres: SELECT * FROM interest_signals WHERE score >= 2.0 AND hit_count >= 2
  → Postgres: SELECT content FROM user_profile WHERE profile_type = 'short_term'
  → Code: Build synthesis prompt (stable signals + current profile)
  → HTTP Request: ask the LLM to synthesize a new short-term profile
  → Postgres: UPDATE user_profile SET content = ... WHERE profile_type = 'short_term'
```

### Stage 1 Query — Weekly Feedback Pull

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
-- Run weekly: apply global decay
UPDATE interest_signals SET score = score * 0.9;

-- For each extracted signal, UPSERT
INSERT INTO interest_signals (topic, category, score, hit_count, last_seen)
VALUES ($1, $2, $3, 1, CURRENT_DATE)
ON CONFLICT (topic) DO UPDATE SET
  score = interest_signals.score + $3,
  hit_count = interest_signals.hit_count + 1,
  category = COALESCE($2, interest_signals.category),
  last_seen = CURRENT_DATE;
-- $3: like → +1.0, dislike → -1.0
```

### Stage 1 LLM Prompt — Topic Extraction

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

### Stage 3 LLM Prompt — Profile Synthesis

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

## Dependency Order

1. Pipeline B first (without feedback there's nothing for C to consume)
2. Enable C after 1–2 weeks of signal data (decay/threshold tuning needs real numbers)
