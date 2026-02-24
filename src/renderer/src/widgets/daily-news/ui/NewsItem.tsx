import { ExternalLink, ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/src/shared/lib/utils";
import { Button } from "@/src/shared/ui/button";
import type {
  NewsItem as NewsItemType,
  FeedbackAction,
} from "../model/daily-news.types";

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
  feedbackState: FeedbackAction | undefined;
  onFeedback: (articleId: string, action: FeedbackAction | "click") => void;
};

export function NewsItem({ item, feedbackState, onFeedback }: NewsItemProps) {
  const handleClick = () => {
    window.open(item.url, "_blank");
    onFeedback(item.id, "click");
  };

  return (
    <article
      className={cn(
        "group w-full text-left px-2.5 py-2 rounded-md transition-colors",
        "hover:bg-muted/60"
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        className="cursor-pointer"
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
          </div>
          <ExternalLink
            className={cn(
              "size-3.5 shrink-0 mt-0.5 text-muted-foreground/40",
              "opacity-0 group-hover:opacity-100 transition-opacity"
            )}
          />
        </div>
      </div>

      <div className="mt-1 flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground/70">
          {item.source}
        </span>
        <span className="text-[10px] text-muted-foreground/70">·</span>
        <span className="text-[10px] text-muted-foreground/70">
          {formatTimeAgo(item.publishedAt)}
        </span>

        <div
          className={cn(
            "ml-auto flex items-center gap-0.5 transition-opacity",
            feedbackState
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100"
          )}
        >
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              onFeedback(item.id, "like");
            }}
            className={cn(
              feedbackState === "like" && "text-emerald-400 bg-emerald-400/10"
            )}
          >
            <ThumbsUp className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              onFeedback(item.id, "dislike");
            }}
            className={cn(
              feedbackState === "dislike" && "text-rose-400 bg-rose-400/10"
            )}
          >
            <ThumbsDown className="size-3" />
          </Button>
        </div>
      </div>
    </article>
  );
}
