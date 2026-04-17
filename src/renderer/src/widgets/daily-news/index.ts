import { Newspaper } from "lucide-react";
import { defineWidget } from "@/src/widgets/widget-registry";
import type { DailyNewsConfig } from "./model/daily-news.types";
import { DailyNewsClient } from "./ui/DailyNewsClient";

export type { DailyNewsConfig } from "./model/daily-news.types";
export type { NewsItem, NewsCategory, DailyNewsState } from "./model/daily-news.types";

export const dailyNewsWidget = defineWidget<DailyNewsConfig>({
  meta: {
    id: "daily-news",
    name: "Daily News",
    description: "AI-summarized news digest organized by topic",
    category: "data",
    icon: Newspaper,
    size: {
      minW: 6,
      minH: 3,
      maxW: 6,
      maxH: 8,
      defaultW: 6,
      defaultH: 5,
    },
  },
  defaultConfig: {},
  ClientComponent: DailyNewsClient,
});
