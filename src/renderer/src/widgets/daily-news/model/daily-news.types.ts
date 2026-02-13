import type { LucideIcon } from "lucide-react";
import { Code, TrendingUp, Sprout, Globe } from "lucide-react";

export type NewsTopic = "tech" | "finance" | "growth" | "world";

export type NewsItem = {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  topic: NewsTopic;
  publishedAt: string;
  relevanceScore: number;
};

export type DailyNewsResponse = {
  fetchedAt: string;
  items: NewsItem[];
};

export type DailyNewsConfig = {
  webhookUrl: string;
};

export type DailyNewsState = {
  items: NewsItem[];
  fetchedAt: string | null;
  fetchStatus: "idle" | "loading" | "success" | "error";
  errorMessage: string | null;
  collapsedSections: Record<NewsTopic, boolean>;
};

export type DailyNewsActions = {
  fetchNews: (webhookUrl: string) => Promise<void>;
  toggleSection: (topic: NewsTopic) => void;
  collapseAll: () => void;
  expandAll: () => void;
};

export type TopicMeta = {
  label: string;
  icon: LucideIcon;
  color: string;
};

export const TOPICS: NewsTopic[] = ["tech", "finance", "growth", "world"];

export const TOPIC_META: Record<NewsTopic, TopicMeta> = {
  tech: { label: "Tech & Dev", icon: Code, color: "text-blue-400" },
  finance: { label: "Finance", icon: TrendingUp, color: "text-emerald-400" },
  growth: { label: "Personal Growth", icon: Sprout, color: "text-amber-400" },
  world: { label: "World & Politics", icon: Globe, color: "text-rose-400" },
};
