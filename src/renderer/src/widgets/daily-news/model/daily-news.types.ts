// Domain types — re-exported from entities
export type {
  NewsCategory,
  NewsItem,
  DailyNewsResponse,
  FeedbackAction,
  CategoryMeta,
} from "@/src/entities/news-article";

export { CATEGORIES, CATEGORY_META } from "@/src/entities/news-article";

// Widget-specific state types (local to this widget)
import type { NewsCategory, NewsItem, FeedbackAction } from "@/src/entities/news-article";

export type DailyNewsConfig = Record<string, never>;

export type DailyNewsState = {
  items: NewsItem[];
  fetchedAt: string | null;
  fetchStatus: "idle" | "loading" | "success" | "error";
  errorMessage: string | null;
  collapsedSections: Record<NewsCategory, boolean>;
  feedback: Record<string, FeedbackAction>;
};

export type DailyNewsActions = {
  fetchNews: () => Promise<void>;
  toggleSection: (category: NewsCategory) => void;
  collapseAll: () => void;
  expandAll: () => void;
  sendFeedback: (articleId: string, action: FeedbackAction | "click") => void;
};
