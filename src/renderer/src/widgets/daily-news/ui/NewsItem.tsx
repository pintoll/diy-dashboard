import { ExternalLink } from "lucide-react";
import { cn } from "@/src/shared/lib/utils";
import type { NewsItem as NewsItemType } from "../model/daily-news.types";

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

type NewsItemProps = {
  item: NewsItemType;
};

export function NewsItem({ item }: NewsItemProps) {
  return (
    <button
      type="button"
      onClick={() => window.open(item.url, "_blank")}
      className={cn(
        "group w-full text-left px-2.5 py-2 rounded-md transition-colors",
        "hover:bg-muted/60"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-sm font-medium leading-snug line-clamp-2",
              "group-hover:text-primary transition-colors"
            )}
          >
            {item.title}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {item.summary}
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
            <span>{item.source}</span>
            <span>·</span>
            <span>{formatTimeAgo(item.publishedAt)}</span>
          </div>
        </div>
        <ExternalLink
          className={cn(
            "size-3.5 shrink-0 mt-0.5 text-muted-foreground/40",
            "opacity-0 group-hover:opacity-100 transition-opacity"
          )}
        />
      </div>
    </button>
  );
}
