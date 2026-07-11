import { useEffect } from "react";
import { KeyRound, RefreshCw } from "lucide-react";
import { cn } from "@/src/shared/lib/utils";
import { formatTimeAgo } from "@/src/shared/lib/format-time-ago";
import { Button } from "@/src/shared/ui/button";
import type { WidgetProps } from "@/src/shared/types";
import type { MacroIndicatorsConfig } from "../model/macro-indicators.types";
import { MACRO_INDICATORS } from "../model/indicators-catalog";
import { TIMEFRAMES } from "../model/timeframe";
import {
  isStale,
  useMacroIndicatorsStore,
} from "../model/use-macro-indicators-store";
import { IndicatorCard } from "./IndicatorCard";

export function MacroIndicatorsClient({
  instanceId,
}: WidgetProps<MacroIndicatorsConfig>) {
  const store = useMacroIndicatorsStore(instanceId);
  const state = store();
  const {
    snapshots,
    lastFetchedAt,
    status,
    errorMessage,
    missingApiKey,
    timeframe,
    fetchAll,
    setTimeframe,
  } = state;

  const hasSnapshots = Object.keys(snapshots).length > 0;

  useEffect(() => {
    if (missingApiKey || status === "loading" || status === "error") return;
    if (!hasSnapshots || isStale(lastFetchedAt)) {
      fetchAll();
    }
  }, [missingApiKey, status, hasSnapshots, lastFetchedAt, fetchAll]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 shrink-0">
        <div className="flex items-center gap-0.5">
          {TIMEFRAMES.map((tf) => {
            const isActive = tf === timeframe;
            return (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums transition-colors",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/40"
                )}
              >
                {tf}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/60">
            {lastFetchedAt ? `Updated ${formatTimeAgo(lastFetchedAt)}` : "Not loaded"}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => fetchAll()}
            disabled={status === "loading"}
            title="Refresh"
          >
            <RefreshCw
              className={cn("size-3.5", status === "loading" && "animate-spin")}
            />
          </Button>
        </div>
      </div>

      {missingApiKey ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <KeyRound className="size-5 text-muted-foreground/60" />
          <div className="text-xs font-medium text-muted-foreground">
            FRED API key is not configured
          </div>
          <div className="text-[10px] text-muted-foreground/60 leading-relaxed">
            Enter your FRED API key in Settings, then refresh this widget.
            <br />
            Get a free key:{" "}
            <span className="text-muted-foreground/80">
              fredaccount.stlouisfed.org/apikey
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1.5 px-2 pb-2 md:grid-cols-3">
            {MACRO_INDICATORS.map((meta) => (
              <IndicatorCard
                key={meta.seriesId}
                meta={meta}
                snapshot={snapshots[meta.seriesId]}
                timeframe={timeframe}
                isLoading={status === "loading"}
              />
            ))}
          </div>
          {status === "error" && errorMessage && (
            <p className="px-3 pb-2 text-[10px] text-destructive/70">
              {errorMessage}
            </p>
          )}
        </>
      )}
    </div>
  );
}
