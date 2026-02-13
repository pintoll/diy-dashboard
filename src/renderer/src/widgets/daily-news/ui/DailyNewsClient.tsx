import { useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/src/shared/lib/utils";
import { Button } from "@/src/shared/ui/button";
import type { WidgetProps } from "@/src/shared/types";
import { useDashboardStore } from "@/src/widgets/dashboard-grid";
import type { DailyNewsConfig, NewsTopic, NewsItem } from "../model/daily-news.types";
import { TOPICS } from "../model/daily-news.types";
import { useDailyNewsStore } from "../model/use-daily-news-store";
import { NewsSection } from "./NewsSection";
import { DailyNewsEmpty } from "./DailyNewsEmpty";
import { DailyNewsSettings } from "./DailyNewsSettings";

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function groupByTopic(items: NewsItem[]): Record<NewsTopic, NewsItem[]> {
  const grouped: Record<NewsTopic, NewsItem[]> = {
    tech: [],
    finance: [],
    growth: [],
    world: [],
  };
  for (const item of items) {
    grouped[item.topic]?.push(item);
  }
  return grouped;
}

export function DailyNewsClient({
  instanceId,
  config,
}: WidgetProps<DailyNewsConfig>) {
  const store = useDailyNewsStore(instanceId);
  const {
    items,
    fetchedAt,
    fetchStatus,
    errorMessage,
    collapsedSections,
    fetchNews,
    toggleSection,
  } = store();

  const updateConfig = useDashboardStore((s) => s.updateConfig);

  const handleFetch = useCallback(() => {
    fetchNews(config.webhookUrl);
  }, [fetchNews, config.webhookUrl]);

  useEffect(() => {
    if (items.length === 0) {
      handleFetch();
    }
  }, [handleFetch, items.length]);

  const handleSaveWebhookUrl = useCallback(
    (webhookUrl: string) => {
      updateConfig(instanceId, { ...config, webhookUrl });
    },
    [updateConfig, instanceId, config]
  );

  const grouped = groupByTopic(items);
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
          <DailyNewsSettings
            webhookUrl={config.webhookUrl}
            onSave={handleSaveWebhookUrl}
          />
        </div>
      </div>

      {/* Content */}
      {showEmpty ? (
        <DailyNewsEmpty status={fetchStatus} errorMessage={errorMessage} />
      ) : (
        <div className="flex flex-col gap-1 overflow-y-auto px-1 pb-2">
          {TOPICS.map((topic) => (
            <NewsSection
              key={topic}
              topic={topic}
              items={grouped[topic]}
              collapsed={collapsedSections[topic]}
              onToggle={() => toggleSection(topic)}
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
