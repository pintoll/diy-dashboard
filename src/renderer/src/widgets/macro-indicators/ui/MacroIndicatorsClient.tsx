import { useEffect } from "react";
import { Plug, RefreshCw } from "lucide-react";
import { cn } from "@/src/shared/lib/utils";
import { formatTimeAgo } from "@/src/shared/lib/format-time-ago";
import { Button } from "@/src/shared/ui/button";
import { groupsOf } from "@/src/entities/market-indicator";
import type { WidgetProps } from "@/src/shared/types";
import type { MacroIndicatorsConfig } from "../model/macro-indicators.types";
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
    connectors,
    snapshots,
    errors,
    lastFetchedAt,
    status,
    errorMessage,
    timeframe,
    activeGroup,
    fetchAll,
    setTimeframe,
    setActiveGroup,
  } = state;

  const hasSnapshots = Object.keys(snapshots).length > 0;

  useEffect(() => {
    if (status === "loading" || status === "error") return;
    if (!hasSnapshots || isStale(lastFetchedAt)) {
      fetchAll();
    }
  }, [status, hasSnapshots, lastFetchedAt, fetchAll]);

  const groups = groupsOf(connectors);
  // Falling back to the first group rather than storing a default keeps the
  // selection valid when connectors change underneath a persisted choice.
  const currentGroup =
    activeGroup && groups.includes(activeGroup) ? activeGroup : groups[0];
  const visible = connectors.filter((c) => c.group === currentGroup);

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

      {connectors.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <Plug className="size-5 text-muted-foreground/60" />
          <div className="text-xs font-medium text-muted-foreground">
            No data sources configured
          </div>
          <div className="text-[10px] text-muted-foreground/60 leading-relaxed">
            Add a source in Settings, then refresh this widget.
          </div>
        </div>
      ) : (
        <>
          {/* One tab per group. Groups come from the connector definitions, so
              adding a source in a new group grows the tab bar on its own. */}
          {groups.length > 1 && (
            <div className="flex items-center gap-0.5 px-2 pb-1.5 shrink-0 overflow-x-auto">
              {groups.map((group) => {
                const isActive = group === currentGroup;
                return (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setActiveGroup(group)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap transition-colors",
                      isActive
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/40"
                    )}
                  >
                    {group}
                  </button>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5 px-2 pb-2 md:grid-cols-3">
            {visible.map((connector) => (
              <IndicatorCard
                key={connector.id}
                connector={connector}
                snapshot={snapshots[connector.id]}
                error={errors[connector.id]}
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
