import type { LucideIcon } from "lucide-react";
import { Code, TrendingUp, Sprout, Globe } from "lucide-react";

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

export type DailyNewsConfig = Record<string, never>;

export type DailyNewsState = {
  items: NewsItem[];
  fetchedAt: string | null;
  fetchStatus: "idle" | "loading" | "success" | "error";
  errorMessage: string | null;
  collapsedSections: Record<NewsCategory, boolean>;
};

export type DailyNewsActions = {
  fetchNews: () => Promise<void>;
  toggleSection: (category: NewsCategory) => void;
  collapseAll: () => void;
  expandAll: () => void;
};

export type CategoryMeta = {
  label: string;
  icon: LucideIcon;
  color: string;
};

export const CATEGORIES: NewsCategory[] = ["tech", "finance", "growth", "world"];

export const CATEGORY_META: Record<NewsCategory, CategoryMeta> = {
  tech: { label: "Tech & Dev", icon: Code, color: "text-blue-400" },
  finance: { label: "Finance", icon: TrendingUp, color: "text-emerald-400" },
  growth: { label: "Personal Growth", icon: Sprout, color: "text-amber-400" },
  world: { label: "World & Politics", icon: Globe, color: "text-rose-400" },
};
