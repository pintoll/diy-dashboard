import { useEffect, useCallback, useMemo, useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/src/shared/lib/utils";
import { formatTimeAgo } from "@/src/shared/lib/format-time-ago";
import { Button } from "@/src/shared/ui/button";
import type { WidgetProps } from "@/src/shared/types";
import type { DailyNewsConfig, NewsCategory, NewsItem } from "../model/daily-news.types";
import { CATEGORIES, CATEGORY_META } from "../model/daily-news.types";
import { useDailyNewsStore } from "../model/use-daily-news-store";
import { NewsItem as NewsItemComponent } from "./NewsItem";
import { DailyNewsEmpty } from "./DailyNewsEmpty";

// Human label for the small "Updating..." progress line in the header.
function stageLabel(status: DailyNewsStatus): string | null {
  switch (status.phase) {
    case "fetching":
      return "fetching feeds";
    case "scoring":
      return status.total > 1
        ? `scoring ${status.current}/${status.total}`
        : "scoring articles";
    case "saving":
      return "saving";
    default:
      return null;
  }
}

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

  // Transient pipeline-progress indicator, driven by main-process push events.
  // Kept in component state (not the persisted store) so a reload never leaves a
  // stale "Updating..." stuck on screen.
  const [updating, setUpdating] = useState(false);
  const [updateStage, setUpdateStage] = useState<string | null>(null);

  const handleFetch = useCallback(() => {
    fetchNews();
  }, [fetchNews]);

  useEffect(() => {
    if (items.length === 0) {
      handleFetch();
    }
  }, [handleFetch, items.length]);

  // Subscribe to ingest progress. A background (scheduled) run and an explicit
  // refresh look identical here: the existing articles stay until the run
  // finishes, then "done" pulls the freshly ingested set in.
  useEffect(() => {
    const unsubscribe = window.electronAPI?.dailyNews.onStatus((status) => {
      if (status.phase === "done") {
        setUpdating(false);
        setUpdateStage(null);
        fetchNews();
      } else if (status.phase === "error") {
        setUpdating(false);
        setUpdateStage(null);
      } else {
        setUpdating(true);
        setUpdateStage(stageLabel(status));
      }
    });
    return unsubscribe;
  }, [fetchNews]);

  const isBusy = updating || fetchStatus === "loading";

  const grouped = useMemo(() => groupByCategory(items), [items]);
  const hasItems = items.length > 0;
  const showEmpty = !hasItems && fetchStatus !== "success";
  const activeItems = grouped[activeTab];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 shrink-0">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
          {updating ? (
            <span className="flex items-center gap-1">
              <Loader2 className="size-2.5 animate-spin" />
              Updating{updateStage ? `… ${updateStage}` : "…"}
            </span>
          ) : (
            fetchedAt && <span>Updated {formatTimeAgo(fetchedAt)}</span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleFetch}
            disabled={isBusy}
          >
            <RefreshCw className={cn("size-3.5", isBusy && "animate-spin")} />
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
