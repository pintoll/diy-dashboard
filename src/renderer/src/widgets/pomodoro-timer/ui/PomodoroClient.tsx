import { useEffect, useRef, useSyncExternalStore, useCallback } from "react";
import { Play, Pause, RotateCcw, SkipForward, Square } from "lucide-react";
import { Button } from "@/src/shared/ui/button";
import type { WidgetProps } from "@/src/shared/types";
import { useFocusModeStore } from "@/src/entities/focus-mode";
import type { PomodoroConfig, PomodoroPhase } from "../model/pomodoro.types";
import { usePomodoroStore } from "../model/use-pomodoro-store";
import {
  showPhaseNotification,
  schedulePhaseEndNotification,
  showOvertimeAlarmNotification,
} from "../model/notifications";
import { playChime } from "../model/chime";
import { formatTime } from "../lib/format";
import {
  FocusModeTab,
  BlocklistButton,
  SiteBlockWarning,
} from "@/src/features/focus-mode/client";
import { PomodoroSettings } from "./PomodoroSettings";
import { SessionReviewDialog } from "./SessionReviewDialog";

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

function triggerPhaseEndAlert(config: PomodoroConfig) {
  if (config.chimeEnabled) playChime();
  if (config.flashEnabled) void window.electronAPI?.flashFrame();
}

type DisplayTickerOpts = {
  getSnapshot: () => number;
  active: boolean;
  syncTime: () => PomodoroPhase | null;
  tick: () => void;
  notificationsEnabled: boolean;
  scheduleNotification: boolean;
  phase: PomodoroPhase;
  getRemainingForNotification: () => number;
};

function useDisplayTicker(opts: DisplayTickerOpts) {
  const {
    getSnapshot,
    active,
    syncTime,
    tick,
    notificationsEnabled,
    scheduleNotification,
    phase,
    getRemainingForNotification,
  } = opts;

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      // The 100ms loop only exists to redraw the on-screen countdown, so it is
      // pure battery drain while the window is hidden to the tray (nothing is
      // visible). Run it only when the document is visible.
      let displayIntervalId: ReturnType<typeof setInterval> | null = null;
      // The phase must still advance on time while hidden — that is what fires
      // the chime, the taskbar flash, and the state transition when the timer
      // ends. One timeout at the remaining duration does that with a single
      // wakeup instead of ~600 wasted 100ms ticks per minute.
      let phaseEndTimeoutId: ReturnType<typeof setTimeout> | null = null;
      let cancelScheduled: (() => void) | null = null;

      // `scheduleNotification` is `!isOvertime`: a bounded phase that has a
      // fixed end to advance to. Overtime counts up with no such end.
      const isBoundedPhase = scheduleNotification;

      const startDisplayInterval = () => {
        if (displayIntervalId !== null) return;
        displayIntervalId = setInterval(() => {
          tick();
          onStoreChange();
        }, 100);
      };

      const stopDisplayInterval = () => {
        if (displayIntervalId !== null) {
          clearInterval(displayIntervalId);
          displayIntervalId = null;
        }
      };

      const armHiddenPhaseEnd = () => {
        if (phaseEndTimeoutId !== null) return;
        const ms = Math.max(0, getRemainingForNotification() * 1000);
        phaseEndTimeoutId = setTimeout(() => {
          phaseEndTimeoutId = null;
          tick();
          onStoreChange();
        }, ms);
      };

      const disarmHiddenPhaseEnd = () => {
        if (phaseEndTimeoutId !== null) {
          clearTimeout(phaseEndTimeoutId);
          phaseEndTimeoutId = null;
        }
      };

      const handleVisibilityChange = () => {
        if (typeof document === "undefined") return;
        if (document.visibilityState === "visible") {
          // The hidden timer (if any) already advanced the phase on time, so
          // syncTime() here normally returns null and does not re-notify.
          disarmHiddenPhaseEnd();
          const completedPhase = syncTime();
          if (completedPhase && notificationsEnabled) {
            showPhaseNotification(completedPhase);
          }
          onStoreChange();
          if (active) startDisplayInterval();
        } else {
          stopDisplayInterval();
          if (active && isBoundedPhase) armHiddenPhaseEnd();
        }
      };

      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", handleVisibilityChange);
      }

      if (active) {
        if (isBoundedPhase && notificationsEnabled) {
          const remaining = getRemainingForNotification();
          if (remaining > 0) {
            cancelScheduled = schedulePhaseEndNotification(remaining, phase);
          }
        }

        const visible =
          typeof document === "undefined" || document.visibilityState === "visible";
        if (visible) {
          startDisplayInterval();
        } else if (isBoundedPhase) {
          armHiddenPhaseEnd();
        }
      }

      return () => {
        if (typeof document !== "undefined") {
          document.removeEventListener("visibilitychange", handleVisibilityChange);
        }
        stopDisplayInterval();
        disarmHiddenPhaseEnd();
        if (cancelScheduled) {
          cancelScheduled();
        }
      };
    },
    [active, syncTime, tick, notificationsEnabled, scheduleNotification, phase, getRemainingForNotification]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function PomodoroClient({
  instanceId,
  config,
}: WidgetProps<PomodoroConfig>) {
  const store = usePomodoroStore(instanceId, config);
  const {
    phase,
    isRunning,
    completedPomodoros,
    activePresetId,
    notificationsEnabled,
    pausedTimeRemaining,
    overtime,
    phaseEndPulse,
    lastOvertimeAlarmThresholdSec,
    pendingReview,
  } = store();
  const {
    start,
    pause,
    reset,
    stop,
    skip,
    tick,
    syncTime,
    getTimeRemaining,
    getOvertimeElapsed,
    pollIdle,
    stopOvertime,
    setPreset,
    setNotificationsEnabled,
    setConfigFlag,
    confirmReview,
    addToBucket,
    addLeisureProcess,
    removeLeisureProcess,
  } = store();
  const currentConfig = store().config;

  const isOvertime = overtime !== null;
  const active = isRunning || isOvertime;

  const getSnapshot = useCallback(
    () => (isOvertime ? getOvertimeElapsed() : getTimeRemaining()),
    [isOvertime, getOvertimeElapsed, getTimeRemaining]
  );

  const displayTime = useDisplayTicker({
    getSnapshot,
    active,
    syncTime,
    tick,
    notificationsEnabled,
    scheduleNotification: !isOvertime,
    phase,
    getRemainingForNotification: getTimeRemaining,
  });

  useEffect(() => {
    const completedPhase = syncTime();
    if (completedPhase && notificationsEnabled) {
      showPhaseNotification(completedPhase);
    }
  }, [syncTime, notificationsEnabled]);

  // Idle polling during overtime
  useEffect(() => {
    if (!isOvertime) return;
    const api = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!api?.getIdleTime) return;

    let cancelled = false;

    const runPoll = async () => {
      if (cancelled) return;
      const idleSec = await api.getIdleTime();
      if (cancelled) return;
      pollIdle(idleSec);
    };

    void runPoll();
    const intervalId = setInterval(runPoll, 5000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void runPoll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isOvertime, pollIdle]);

  // Publish work-session-active to the shared focus-mode signal so the block
  // controller can enforce/release. Independent of detectionEnabled — blocking
  // must work even with active-window telemetry off.
  const setSessionActive = useFocusModeStore((s) => s.setSessionActive);
  const isWorkSession = phase === "work" && active;
  useEffect(() => {
    setSessionActive(isWorkSession);
  }, [isWorkSession, setSessionActive]);
  useEffect(() => {
    return () => setSessionActive(false);
  }, [setSessionActive]);

  const isWorkSessionActive =
    phase === "work" && (isRunning || isOvertime) && currentConfig.detectionEnabled;
  useEffect(() => {
    if (!isWorkSessionActive) return;
    const api = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!api?.onActiveWindow || !api.notifyPomodoroSessionStarted) return;

    void api.notifyPomodoroSessionStarted();
    const unsubscribe = api.onActiveWindow(({ exeName }) => {
      addToBucket(exeName, 10);
    });

    return () => {
      unsubscribe();
      void api.notifyPomodoroSessionEnded?.();
    };
  }, [isWorkSessionActive, addToBucket]);

  // Chime + taskbar flash on phase end
  const lastPulseRef = useRef<number | null>(null);
  useEffect(() => {
    if (lastPulseRef.current === null) {
      lastPulseRef.current = phaseEndPulse;
      return;
    }
    if (phaseEndPulse === lastPulseRef.current) return;
    lastPulseRef.current = phaseEndPulse;
    triggerPhaseEndAlert(currentConfig);
  }, [phaseEndPulse, currentConfig]);

  // Chime + flash + OS notification on each overtime alarm threshold
  const lastOvertimeAlarmThresholdRef = useRef(lastOvertimeAlarmThresholdSec);
  useEffect(() => {
    if (lastOvertimeAlarmThresholdSec === lastOvertimeAlarmThresholdRef.current) return;
    lastOvertimeAlarmThresholdRef.current = lastOvertimeAlarmThresholdSec;
    if (lastOvertimeAlarmThresholdSec === null) return;
    triggerPhaseEndAlert(currentConfig);
    if (notificationsEnabled) {
      showOvertimeAlarmNotification(lastOvertimeAlarmThresholdSec);
    }
  }, [lastOvertimeAlarmThresholdSec, notificationsEnabled, currentConfig]);

  const phaseLabel = isOvertime ? "Overtime" : PHASE_LABELS[phase];
  const phaseColor = isOvertime ? "text-destructive" : PHASE_COLORS[phase];
  const timeText = isOvertime ? `+${formatTime(displayTime)}` : formatTime(displayTime);
  const timeColor = isOvertime ? "text-destructive" : "";

  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI : undefined;
    if (!api?.setTrayTooltip) return;
    if (!active) {
      void api.setTrayTooltip(null);
      return;
    }
    void api.setTrayTooltip(`DIY Dashboard - ${phaseLabel} ${timeText}`);
  }, [active, phaseLabel, timeText]);

  useEffect(() => {
    return () => {
      const api = typeof window !== "undefined" ? window.electronAPI : undefined;
      void api?.setTrayTooltip?.(null);
    };
  }, []);

  return (
    <div className="relative flex flex-col items-center justify-center h-full gap-4">
      <div className="absolute top-0 left-0 flex items-center gap-1.5">
        <FocusModeTab />
        <SiteBlockWarning />
      </div>
      <div className="absolute top-0 right-0 flex items-center gap-0.5">
        <BlocklistButton />
        <PomodoroSettings
          activePresetId={activePresetId}
          config={currentConfig}
          onPresetChange={setPreset}
          notificationsEnabled={notificationsEnabled}
          onNotificationsChange={setNotificationsEnabled}
          leisureProcesses={currentConfig.leisureProcesses}
          onAddLeisureProcess={addLeisureProcess}
          onRemoveLeisureProcess={removeLeisureProcess}
          onConfigFlagChange={setConfigFlag}
        />
      </div>
      <div className={`text-sm font-medium ${phaseColor}`}>
        {phaseLabel}
        {isOvertime && overtime?.isIdle && (
          <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground">
            Idle — paused
          </span>
        )}
      </div>

      <div className={`text-5xl font-mono font-bold tabular-nums ${timeColor}`}>
        {timeText}
      </div>

      <div className="flex items-center gap-2">
        {isOvertime ? (
          <Button variant="destructive" size="icon" onClick={stopOvertime} title="Stop and save">
            <Square className="h-4 w-4" />
          </Button>
        ) : isRunning ? (
          <Button variant="outline" size="icon" onClick={pause}>
            <Pause className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="default" size="icon" onClick={start}>
            <Play className="h-4 w-4" />
          </Button>
        )}
        <Button variant="outline" size="icon" onClick={reset} title={isOvertime ? "Discard overtime" : "Reset"}>
          <RotateCcw className="h-4 w-4" />
        </Button>
        {!isOvertime && phase === "work" && (isRunning || pausedTimeRemaining !== null) && (
          <Button variant="outline" size="icon" onClick={stop} title="Stop & log time spent">
            <Square className="h-4 w-4" />
          </Button>
        )}
        {!isOvertime && (
          <Button variant="outline" size="icon" onClick={skip}>
            <SkipForward className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        Completed: {completedPomodoros}
      </div>

      <SessionReviewDialog
        open={pendingReview !== null}
        pending={pendingReview}
        leisureProcesses={currentConfig.leisureProcesses}
        detectionEnabled={currentConfig.detectionEnabled}
        onConfirm={confirmReview}
        onMarkAsLeisure={addLeisureProcess}
      />
    </div>
  );
}
