import { getDb } from "./db";
import { kstToday } from "./kst";
import type {
  ArticleRow,
  DailyNewsResponse,
  NewsCategory,
  NewsItem,
} from "./types";

// Mirrors the "Serve Daily News" workflow: the SQL query plus the
// "Format for Widget" code node, but scoped to today in KST instead of the
// Postgres CURRENT_DATE (which is UTC).
export function getTodayNews(): DailyNewsResponse {
  const rows = getDb()
    .prepare(
      "SELECT * FROM articles WHERE fetched_date = ? ORDER BY final_score DESC"
    )
    .all(kstToday()) as ArticleRow[];

  const items: NewsItem[] = rows.map((row) => ({
    id: `news-${row.id}`,
    title: row.title,
    summary: row.summary ?? "",
    url: row.url,
    source: row.source ?? "",
    category: (row.category ?? "") as NewsCategory,
    publishedAt: row.published_at ?? "",
    relevanceScore: Math.round((row.final_score || 5) * 10),
  }));

  return { fetchedAt: new Date().toISOString(), items };
}

export function hasTodayArticles(): boolean {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS count FROM articles WHERE fetched_date = ?")
    .get(kstToday()) as { count: number };
  return row.count > 0;
}
