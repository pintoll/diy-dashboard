export type NewsCategory = "tech" | "finance" | "growth" | "world";

export type NewsItem = {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  category: NewsCategory;
  publishedAt: string;
  relevanceScore: number;
};

export type DailyNewsResponse = {
  fetchedAt: string;
  items: NewsItem[];
};

export type FeedbackActionType =
  | "like"
  | "dislike"
  | "unlike"
  | "undislike"
  | "click";

export type ArticleRow = {
  id: number;
  title: string;
  summary: string | null;
  url: string;
  source: string | null;
  category: string | null;
  published_at: string | null;
  relevance: number | null;
  importance: number | null;
  final_score: number | null;
  tag: string | null;
  fetched_date: string;
  created_at: string;
};
