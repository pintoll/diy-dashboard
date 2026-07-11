# Daily News Pipeline Architecture

Personalized news pipeline running entirely inside the Electron main process. Earlier versions of this feature ran on a remote n8n + PostgreSQL server (`pintomate.duckdns.org`); the whole pipeline was ported to a local, in-process implementation so the app has no server dependency. This file documents the local architecture as built.

## Overview

```
Electron main process
┌───────────────────────────────────────────────────────────┐
│  scheduler.ts — tick every 30 min while the app is running │
│    ├─ ensureDailyNewsForToday() ──▶ ingest.ts  (Gemini)     │
│    └─ ensureWeeklyProfile()     ──▶ profile.ts (Gemini)     │
│                          │                                  │
│                          ▼                                  │
│              SQLite (daily-news.db, WAL mode)                │
│     articles · feedback · user_profile · interest_signals    │
└──────────────────────────┬────────────────────────────────────┘
                           │ IPC (dailyNews:*)
                           ▼
              Electron Renderer — daily-news widget
```

`db.ts`, `ingest.ts`, `feedback.ts`, `profile.ts`, `serve.ts`, `scheduler.ts`, `gemini.ts`, `sources.ts`, `kst.ts`, and `ipc.ts` live under `src/main/daily-news/`.

## Ingestion

`runIngest()` in `ingest.ts` is a faithful port of the original n8n scoring workflow, now running as plain async functions instead of workflow nodes:

```
loadProfile()                     read core + short_term rows from user_profile
  → fetchAllItems()                RSS_SOURCES, one feed at a time, failures skipped+logged
  → cleanAndDedup()                dedup by link, strip HTML, truncate description to 300 chars
  → buildBatches()                 chunk into groups of 15 articles
  → geminiGenerate() per batch      Gemini scores each article
  → scoreBatch()                    parse + apply the scoring formula
  → serendipity                     revive up to 2 randomly dropped articles
  → formatResponse()                sort by score, cap 8 per category
  → upsert into articles            ON CONFLICT(url) DO UPDATE
```

### Scoring formula

```
final_score = relevance × 0.7 + importance × 0.3
```

- `relevance` (0–10) and `importance` (0–10) are Gemini-judged per article.
- Bypass: `importance >= 9` is included regardless of `final_score`.
- Threshold: `final_score >= 4.5` is included.
- Serendipity: up to 2 otherwise-dropped articles are revived at random, tagged `serendipity`.
- Cap: at most 8 articles per category survive into `articles` (highest score first).

On a Gemini response that fails to parse as JSON, every article in that batch is included anyway with `relevance = importance = 5`, tagged `parse_error` — a fabricated middling score rather than a dropped batch (tracked as an open item in [`wip/oss-readiness-audit.md`](../wip/oss-readiness-audit.md)).

### Prompt

The system instruction injects two profiles read from `user_profile`:

- **`core`** — long-term interests, only ever edited by hand (there is no UI for it; edit the row directly if needed).
- **`short_term`** — rewritten weekly by the profile-update job below.

## Feedback

`recordFeedback()` in `feedback.ts`, invoked over IPC as `dailyNews:feedback`. Actions: `like` / `dislike` / `unlike` / `undislike` / `click`. `like`/`dislike`/`click` insert a row (`ON CONFLICT DO NOTHING`); `unlike`/`undislike` delete the matching row. No webhook, no network round trip — it's a synchronous local write.

## Weekly profile update

`runWeeklyProfileUpdate()` in `profile.ts`, a faithful port of the former "Pipeline C" workflow:

```
stamp user_profile.short_term.updated_at        throttles this whole job to once/week
  → decay all interest_signals scores × 0.9
  → read the last 7 days of feedback (joined to articles, excluding tag = 'bypass')
  → Gemini: extract topic keywords + like/dislike direction from that feedback
  → upsert interest_signals (score += direction, hit_count += 1)
  → filter to "stable" signals: score >= 2.0 AND hit_count >= 2
  → Gemini: rewrite short_term profile content from the stable signals + current profile
  → update user_profile.short_term
```

Early-exits (no feedback this week, no stable signals yet, no Gemini key configured) still count as a completed run once the timestamp is stamped, so the job doesn't refire on every scheduler tick while waiting for enough signal.

## Scheduler

`startDailyNewsScheduler()` runs a tick immediately on app start, then every 30 minutes for as long as the app is open:

- `ensureDailyNewsForToday()` — runs the ingest pipeline only if today (KST) has no articles yet, and only from `kstHour() >= 5` onward. Also invoked directly and synchronously-awaited from the `dailyNews:fetch` IPC handler, so a manual refresh and the background tick can never run ingestion concurrently (guarded by an `ingestRunning` flag).
- `ensureWeeklyProfile()` — runs the profile-update job only when `user_profile.short_term.updated_at` is 7+ days old (or never set), independent of the daily gate.

## Database (SQLite, `<userData>/daily-news.db`, WAL)

```
articles
├── id            INTEGER PRIMARY KEY AUTOINCREMENT
├── title         TEXT NOT NULL
├── summary       TEXT
├── url           TEXT NOT NULL UNIQUE
├── source        TEXT
├── category      TEXT            ← "tech" | "finance" | "growth" | "world"
├── published_at  TEXT
├── relevance     INTEGER         ← 0–10
├── importance    INTEGER         ← 0–10
├── final_score   REAL            ← weighted sum (0–10)
├── tag           TEXT            ← "relevant" | "bypass" | "serendipity" | "parse_error"
├── fetched_date  TEXT NOT NULL DEFAULT CURRENT_DATE
└── created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    (indexed on (fetched_date, final_score) — serves both the scheduler's
     COUNT(*) WHERE fetched_date=? and the widget's reverse-score read)

feedback
├── id            INTEGER PRIMARY KEY AUTOINCREMENT
├── article_id    INTEGER NOT NULL REFERENCES articles(id)
├── action        TEXT NOT NULL   ← "like" | "dislike" | "click"
├── created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
└── UNIQUE(article_id, action)

user_profile
├── id            INTEGER PRIMARY KEY AUTOINCREMENT
├── profile_type  TEXT NOT NULL UNIQUE  ← "core" | "short_term"
├── content       TEXT NOT NULL         ← injected into the Gemini prompt
└── updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP

interest_signals
├── id            INTEGER PRIMARY KEY AUTOINCREMENT
├── topic         TEXT NOT NULL UNIQUE  ← "rust-lang", "llm-agents", etc.
├── category      TEXT
├── score         REAL NOT NULL DEFAULT 0   ← like +1 / dislike -1, weekly ×0.9 decay
├── hit_count     INTEGER NOT NULL DEFAULT 0
├── last_seen     TEXT NOT NULL DEFAULT CURRENT_DATE
└── created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
```

`foreign_keys = ON` is set explicitly (SQLite defaults it off). A fresh install seeds the two `user_profile` rows with placeholder content; `articles`/`feedback`/`interest_signals` start empty.

## RSS sources

Managed as a plain array in `sources.ts` — add a source by appending an entry:

```
Tech:    Hacker News, TechCrunch
Finance: Yahoo Finance, MarketWatch
Growth:  Tiny Buddha, Lifehack
World:   BBC World, The Guardian World
```

## IPC surface

| Channel | Direction | Purpose |
|---|---|---|
| `dailyNews:fetch` | renderer → main (invoke) | Ensures today's articles exist (runs ingest if missing), returns them |
| `dailyNews:feedback` | renderer → main (invoke) | Records like/dislike/click |
| `dailyNews:status` | main → renderer (push) | Ingest progress (`fetching` / `scoring` / `saving` / `done` / `error`) for the widget's "Updating…" indicator |
| `settings:getGeminiKey` / `settings:setGeminiKey` | renderer ↔ main (invoke) | Runtime Gemini key, stored in `settings.json` |

No HTTP server, no external webhook — this is all in-process `ipcMain.handle` / `webContents.send`.

## Cost

- Gemini Flash: free tier (15 RPM, 1M TPD as of the API version in use)
- SQLite: local file, no hosting cost
- Estimated total: **$0/month**
