# Daily News — Webhook API Contracts

External interfaces exposed by n8n. The Electron renderer calls them via `fetch`.

Base URL: `https://pintomate.duckdns.org`

## GET /webhook/daily-news ✅

Returns articles fetched today.

```
GET /webhook/daily-news
→ 200 OK
[
  {
    "id": 42,
    "title": "...",
    "summary": "...",
    "url": "https://...",
    "source": "Hacker News",
    "topic": "tech",          // category → topic mapping
    "score": 87,              // final_score × 10
    "tag": "relevant" | "bypass" | "serendipity",
    "publishedAt": "2026-04-25T01:23:45Z"
  }
]
```

n8n workflow: `Webhook (GET) → Postgres SELECT (fetched_date = CURRENT_DATE) → Code: Format for Widget → Response`.

## GET /webhook/profile ✅

Read-only view of the profiles injected into the LLM prompt.

```
GET /webhook/profile
→ 200 OK
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

n8n Code Node — Format Response:

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

## POST /webhook/daily-news-run ✅

Manual trigger for Pipeline A (admin use).

```
POST /webhook/daily-news-run
→ 200 OK
```

## POST /webhook/daily-news-feedback 🚧

Feedback collection (👍/👎). Activates when Pipeline B ships — tracked in [`wip/daily-news.md`](../wip/daily-news.md).

```
POST /webhook/daily-news-feedback
Content-Type: application/json

{ "articleId": 42, "action": "like" | "dislike" }

→ 200 OK
```

Server logic: `INSERT INTO feedback (article_id, action)`. Feedback on `tag="bypass"` articles is stored but excluded from Pipeline C's profile-learning stage.
