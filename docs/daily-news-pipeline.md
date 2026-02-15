# Daily News Pipeline Architecture

n8n 기반 개인화 뉴스 파이프라인 설계.

## Overview

```
n8n (Private Server)
┌────────────┐   ┌─────────────┐   ┌──────────────┐   ┌──────────┐
│ 1. Collect  │──▶│ 2. Summarize│──▶│ 3. Score     │──▶│ 4. Serve │
│ (Cron)      │   │ (LLM)       │   │ (Profile)    │   │ (Webhook)│
└────────────┘   └─────────────┘   └──────────────┘   └────▲─────┘
                                    ▲                       │
                                    │    ┌─────────────┐    │
                                    └────│ 5. Feedback  │◀───┘
                                         │ (Learn)      │
                                         └─────────────┘
                                              ▲
                                              │
                                     Electron Widget
                                     (fetch + feedback)
```

## Stages

### 1. Collect (Cron, 1~2x/day)

RSS, API, 크롤링으로 raw articles 수집 → 중간 DB 저장 (URL 해시 기반 중복 제거).

| Source Type | n8n Node     | Example              |
|-------------|-------------|----------------------|
| RSS         | RSS Read    | HN, TechCrunch       |
| API         | HTTP Request| Reddit, NewsAPI      |
| Crawl       | HTTP + HTML | Specific blogs/sites |

### 2. Summarize (LLM)

```
Raw article → LLM → { summary, topic, keywords, initialRelevance }
```

- 비용 절감: 저렴한 모델로 분류 → 상위 N개만 고급 모델로 요약
- n8n AI Agent / OpenAI / Anthropic 노드 사용

### 3. Score & Rank (User Profile)

서버에 `user_profile.json` 유지:

```jsonc
{
  "interests": {
    "keywords": { "react": 0.9, "rust": 0.7, "ai": 0.85 },
    "sources":  { "Hacker News": 0.8 },
    "topics":   { "tech": 0.9, "finance": 0.5, "growth": 0.7, "world": 0.3 }
  }
}
```

Scoring: keyword matching + source preference + topic weight → topic별 상위 N개 선별.

### 4. Serve (Webhook → Widget)

`GET /webhook/daily-news` → 기존 위젯 포맷 그대로:

```jsonc
{
  "fetchedAt": "2026-02-15T09:00:00Z",
  "items": [
    { "id", "title", "summary", "url", "source", "topic", "publishedAt", "relevanceScore" }
  ]
}
```

### 5. Feedback Loop

위젯에서 유저 행동 데이터 수집 → 프로필 자동 업데이트.

`POST /webhook/daily-news-feedback`

| Signal          | Strength | Status       |
|-----------------|----------|--------------|
| Article click   | Strong+  | Already have |
| Explicit like   | Strongest| UI needed    |
| Explicit dislike| Strongest| UI needed    |
| Dismiss article | Medium-  | UI needed    |
| Topic collapse  | Weak-    | Already have |

주기적으로 LLM이 feedback history 분석 → profile weights 재계산.

## Phases

1. **MVP**: Collect → Summarize → 고정 프로필 필터 → Serve
2. **Feedback v1**: 클릭 피드백 전송 → 프로필 자동 업데이트
3. **Advanced**: Like/dislike UI → LLM re-ranking → topic/source 자동 조정
