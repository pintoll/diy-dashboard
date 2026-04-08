import { useEffect, useCallback, useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/src/shared/lib/utils";
import { formatTimeAgo } from "@/src/shared/lib/format-time-ago";
import { Button } from "@/src/shared/ui/button";
import type { WidgetProps } from "@/src/shared/types";
import type { DailyNewsConfig, NewsCategory, NewsItem } from "../model/daily-news.types";
import { CATEGORIES, CATEGORY_META } from "../model/daily-news.types";
import { useDailyNewsStore } from "../model/use-daily-news-store";
import { NewsItem as NewsItemComponent } from "./NewsItem";
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
  const { fetchedAt, fetchStatus, errorMessage, activeTab, feedback, fetchNews, setActiveTab, sendFeedback } = state;

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
  const activeItems = grouped[activeTab];

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

      {/* Tabs */}
      {hasItems && (
        <div className="flex items-center gap-0.5 px-1.5 pb-1 shrink-0">
          {CATEGORIES.map((category) => {
            const meta = CATEGORY_META[category];
            const Icon = meta.icon;
            const count = grouped[category].length;
            const isActive = activeTab === category;

            return (
              <button
                key={category}
                type="button"
                onClick={() => setActiveTab(category)}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/40"
                )}
              >
                <Icon className={cn("size-3", isActive && meta.color)} />
                <span>{meta.label}</span>
                {count > 0 && (
                  <span className={cn(
                    "text-[9px] tabular-nums",
                    isActive ? "text-muted-foreground" : "text-muted-foreground/40"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      {showEmpty ? (
        <DailyNewsEmpty status={fetchStatus} errorMessage={errorMessage} />
      ) : (
        <div className="flex flex-col gap-0.5 overflow-y-auto px-1 pb-2">
          {activeItems.length > 0 ? (
            activeItems.map((item) => (
              <NewsItemComponent
                key={item.id}
                item={item}
                feedbackState={feedback[item.id]}
                onFeedback={sendFeedback}
              />
            ))
          ) : (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground/50">
              No articles in this category
            </p>
          )}

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
