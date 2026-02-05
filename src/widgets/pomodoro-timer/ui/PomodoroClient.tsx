"use client";

import { useEffect, useSyncExternalStore, useCallback } from "react";
import { Play, Pause, RotateCcw, SkipForward } from "lucide-react";
import { Button } from "@/src/shared/ui/button";
import type { WidgetProps } from "@/src/shared/types";
import type { PomodoroConfig } from "../model/pomodoro.types";
import { usePomodoroStore } from "../model/use-pomodoro-store";

const PHASE_LABELS = {
  work: "Focus Time",
  shortBreak: "Short Break",
  longBreak: "Long Break",
} as const;

const PHASE_COLORS = {
  work: "text-primary",
  shortBreak: "text-accent",
  longBreak: "text-chart-3",
} as const;

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function useTimeDisplay(
  getTimeRemaining: () => number,
  isRunning: boolean,
  syncTime: () => void,
  tick: () => void
) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      let intervalId: ReturnType<typeof setInterval> | null = null;

      const handleVisibilityChange = () => {
        if (typeof document !== "undefined" && document.visibilityState === "visible") {
          syncTime();
          onStoreChange();
        }
      };

      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", handleVisibilityChange);
      }

      if (isRunning) {
        intervalId = setInterval(() => {
          tick();
          onStoreChange();
        }, 100);
      }

      return () => {
        if (typeof document !== "undefined") {
          document.removeEventListener("visibilitychange", handleVisibilityChange);
        }
        if (intervalId !== null) {
          clearInterval(intervalId);
        }
      };
    },
    [isRunning, syncTime, tick]
  );

  return useSyncExternalStore(subscribe, getTimeRemaining, getTimeRemaining);
}

export function PomodoroClient({
  instanceId,
  config,
}: WidgetProps<PomodoroConfig>) {
  const store = usePomodoroStore(instanceId, config);
  const { phase, isRunning, completedPomodoros } = store();
  const { start, pause, reset, skip, tick, syncTime, getTimeRemaining } = store();

  const displayTime = useTimeDisplay(getTimeRemaining, isRunning, syncTime, tick);

  useEffect(() => {
    syncTime();
  }, [syncTime]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className={`text-sm font-medium ${PHASE_COLORS[phase]}`}>
        {PHASE_LABELS[phase]}
      </div>

      <div className="text-5xl font-mono font-bold tabular-nums">
        {formatTime(displayTime)}
      </div>

      <div className="flex items-center gap-2">
        {isRunning ? (
          <Button variant="outline" size="icon" onClick={pause}>
            <Pause className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="default" size="icon" onClick={start}>
            <Play className="h-4 w-4" />
          </Button>
        )}
        <Button variant="outline" size="icon" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={skip}>
          <SkipForward className="h-4 w-4" />
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        Completed: {completedPomodoros}
      </div>
    </div>
  );
}
