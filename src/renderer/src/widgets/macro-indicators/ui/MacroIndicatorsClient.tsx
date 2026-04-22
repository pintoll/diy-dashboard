import { useCallback, useEffect } from "react";
import { KeyRound, RefreshCw } from "lucide-react";
import { cn } from "@/src/shared/lib/utils";
import { formatTimeAgo } from "@/src/shared/lib/format-time-ago";
import { Button } from "@/src/shared/ui/button";
import type { WidgetProps } from "@/src/shared/types";
import type { MacroIndicatorsConfig } from "../model/macro-indicators.types";
import { MACRO_INDICATORS } from "../model/indicators-catalog";
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
    fetchAll,
  } = state;

  const handleFetch = useCallback(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (isStale(lastFetchedAt)) {
      handleFetch();
    }
    // intentionally only on mount per instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1.5 shrink-0">
        <div className="text-[10px] text-muted-foreground/60">
          {lastFetchedAt ? `Updated ${formatTimeAgo(lastFetchedAt)}` : "Not loaded"}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleFetch}
          disabled={status === "loading"}
          title="Refresh"
        >
          <RefreshCw
            className={cn("size-3.5", status === "loading" && "animate-spin")}
          />
        </Button>
      </div>

      {missingApiKey ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <KeyRound className="size-5 text-muted-foreground/60" />
          <div className="text-xs font-medium text-muted-foreground">
            FRED API key가 설정되지 않았어요
          </div>
          <div className="text-[10px] text-muted-foreground/60 leading-relaxed">
            프로젝트 루트의 <code className="rounded bg-muted/40 px-1">.env</code>에{" "}
            <code className="rounded bg-muted/40 px-1">MAIN_VITE_FRED_API_KEY</code>를
            추가하고 앱을 재시작하세요.
            <br />
            무료 키 발급:{" "}
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
