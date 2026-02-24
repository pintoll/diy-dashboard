import { ChevronRight } from "lucide-react";
import { cn } from "@/src/shared/lib/utils";
import type { NewsItem as NewsItemType, NewsCategory, FeedbackAction } from "../model/daily-news.types";
import { CATEGORY_META } from "../model/daily-news.types";
import { NewsItem } from "./NewsItem";

type NewsSectionProps = {
  category: NewsCategory;
  items: NewsItemType[];
  collapsed: boolean;
  onToggle: () => void;
  feedback: Record<string, FeedbackAction>;
  onFeedback: (articleId: string, action: FeedbackAction | "click") => void;
};

export function NewsSection({ category, items, collapsed, onToggle, feedback, onFeedback }: NewsSectionProps) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;

  if (items.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors"
      >
        <ChevronRight
          className={cn(
            "size-3.5 text-muted-foreground/60 transition-transform duration-200",
            !collapsed && "rotate-90"
          )}
        />
        <Icon className={cn("size-3.5", meta.color)} />
        <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
          {meta.label}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground/50 tabular-nums">
          {items.length}
        </span>
      </button>

      {!collapsed && (
        <div className="flex flex-col gap-0.5 mt-0.5">
          {items.map((item) => (
            <NewsItem
              key={item.id}
              item={item}
              feedbackState={feedback[item.id]}
              onFeedback={onFeedback}
            />
          ))}
        </div>
      )}
    </div>
  );
}
