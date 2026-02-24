import { useEffect, useCallback, useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/src/shared/lib/utils";
import { formatTimeAgo } from "@/src/shared/lib/format-time-ago";
import { Button } from "@/src/shared/ui/button";
import type { WidgetProps } from "@/src/shared/types";
import type { DailyNewsConfig, NewsCategory, NewsItem } from "../model/daily-news.types";
import { CATEGORIES } from "../model/daily-news.types";
import { useDailyNewsStore } from "../model/use-daily-news-store";
import { NewsSection } from "./NewsSection";
import { DailyNewsEmpty } from "./DailyNewsEmpty";

function groupByCategory(items: NewsItem[]): Record<NewsCategory, NewsItem[]> {
  const grouped: Record<NewsCategory, NewsItem[]> = {
    tech: [],
    finance: [],
    growth: [],
    world: [],
  };
  for (const item of items) {
    grouped[item.category]?.push(item);
  }
  return grouped;
}

export function DailyNewsClient({
  instanceId,
}: WidgetProps<DailyNewsConfig>) {
  const store = useDailyNewsStore(instanceId);
  const state = store();
  const stateItems = state.items;
  const items = useMemo(() => stateItems ?? [], [stateItems]);
  const { fetchedAt, fetchStatus, errorMessage, collapsedSections, feedback, fetchNews, toggleSection, sendFeedback } = state;

  const handleFetch = useCallback(() => {
    fetchNews();
  }, [fetchNews]);

  useEffect(() => {
    if (items.length === 0) {
      handleFetch();
    }
  }, [handleFetch, items.length]);

  const grouped = useMemo(() => groupByCategory(items), [items]);
  const hasItems = items.length > 0;
  const showEmpty = !hasItems && fetchStatus !== "success";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 shrink-0">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
          {fetchedAt && <span>Updated {formatTimeAgo(fetchedAt)}</span>}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleFetch}
            disabled={fetchStatus === "loading"}
          >
            <RefreshCw
              className={cn(
                "size-3.5",
                fetchStatus === "loading" && "animate-spin"
              )}
            />
          </Button>
        </div>
      </div>

      {/* Content */}
      {showEmpty ? (
        <DailyNewsEmpty status={fetchStatus} errorMessage={errorMessage} />
      ) : (
        <div className="flex flex-col gap-1 overflow-y-auto px-1 pb-2">
          {CATEGORIES.map((category) => (
            <NewsSection
              key={category}
              category={category}
              items={grouped[category]}
              collapsed={collapsedSections[category]}
              onToggle={() => toggleSection(category)}
              feedback={feedback}
              onFeedback={sendFeedback}
            />
          ))}

          {fetchStatus === "error" && errorMessage && (
            <p className="px-2 py-1 text-[10px] text-destructive/70">
              {errorMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
