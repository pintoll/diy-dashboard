import { useEffect, useMemo } from "react";
import { CalendarX, KeyRound, RefreshCw } from "lucide-react";
import { cn } from "@/src/shared/lib/utils";
import { formatTimeAgo } from "@/src/shared/lib/format-time-ago";
import { Button } from "@/src/shared/ui/button";
import type { WidgetProps } from "@/src/shared/types";
import type { EconomicCalendarConfig } from "../model/economic-calendar.types";
import { applyFilters, groupByDay } from "../model/filters";
import {
  isStale,
  useEconomicCalendarStore,
} from "../model/use-economic-calendar-store";
import { DayGroup } from "./DayGroup";
import { RangeSelector } from "./RangeSelector";
import { TypeFilter } from "./TypeFilter";
import { ImportanceFilter } from "./ImportanceFilter";

export function EconomicCalendarClient({
  instanceId,
}: WidgetProps<EconomicCalendarConfig>) {
  const store = useEconomicCalendarStore(instanceId);
  const state = store();
  const {
    events,
    lastFetchedAt,
    status,
    errorMessage,
    missingApiKey,
    rangeKey,
    typeFilter,
    minImportance,
    fetchRange,
    setRange,
    setTypeFilter,
    setMinImportance,
  } = state;

  const hasEvents = events.length > 0;

  useEffect(() => {
    if (missingApiKey || status === "loading" || status === "error") return;
    if (!hasEvents || isStale(lastFetchedAt)) {
      fetchRange();
    }
  }, [missingApiKey, status, hasEvents, lastFetchedAt, fetchRange]);

  const groups = useMemo(() => {
    const filtered = applyFilters(events, rangeKey, typeFilter, minImportance);
    return groupByDay(filtered);
  }, [events, rangeKey, typeFilter, minImportance]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 shrink-0 border-b border-border/30">
        <div className="flex items-center gap-2">
          <RangeSelector value={rangeKey} onChange={setRange} />
          <span className="text-muted-foreground/30">·</span>
          <TypeFilter value={typeFilter} onChange={setTypeFilter} />
          <span className="text-muted-foreground/30">·</span>
          <ImportanceFilter value={minImportance} onChange={setMinImportance} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/60">
            {lastFetchedAt
              ? `Updated ${formatTimeAgo(lastFetchedAt)}`
              : "Not loaded"}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => fetchRange()}
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
            Add{" "}
            <code className="rounded bg-muted/40 px-1">MAIN_VITE_FRED_API_KEY</code>{" "}
            to <code className="rounded bg-muted/40 px-1">.env</code> at the project
            root and restart the app.
            <br />
            Free key:{" "}
            <span className="text-muted-foreground/80">
              fredaccount.stlouisfed.org/apikey
            </span>
          </div>
        </div>
      ) : groups.length === 0 && status !== "loading" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <CalendarX className="size-5 text-muted-foreground/60" />
          <div className="text-xs text-muted-foreground">
            No events in this range
          </div>
          <div className="text-[10px] text-muted-foreground/60">
            Adjust filters or hit refresh
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {groups.map((group) => (
            <DayGroup
              key={group.dateKey}
              dateKey={group.dateKey}
              items={group.items}
            />
          ))}
        </div>
      )}

      {status === "error" && errorMessage && (
        <p className="px-3 pb-2 text-[10px] text-destructive/70 border-t border-border/30">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
