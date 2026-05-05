import { useMemo } from "react";
import { createWidgetStore } from "@/src/shared/lib/create-widget-store";
import { useSessionLogStore } from "@/src/entities/pomodoro-session";
import type {
  PomodoroConfig,
  PomodoroPhase,
  PomodoroPresetId,
  PomodoroState,
  PomodoroActions,
  OvertimeState,
} from "./pomodoro.types";

type PomodoroStore = PomodoroState & PomodoroActions & { config: PomodoroConfig };

const STORE_VERSION = 7;
const OVERTIME_CAP_SEC = 3600;
const OVERTIME_IDLE_THRESHOLD_SEC = 60;
const OVERTIME_ALARM_THRESHOLDS_SEC = [300, 600, 1200, 1800, 3600] as const;

const OVERTIME_AVAILABLE =
  typeof window !== "undefined" && !!window.electronAPI?.getIdleTime;

function getNextPhase(
  currentPhase: PomodoroPhase,
  completedPomodoros: number,
  pomodorosUntilLongBreak: number
): PomodoroPhase {
  if (currentPhase === "work") {
    return (completedPomodoros + 1) % pomodorosUntilLongBreak === 0
      ? "longBreak"
      : "shortBreak";
  }
  return "work";
}

function getDurationForPhase(phase: PomodoroPhase, config: PomodoroConfig): number {
  switch (phase) {
    case "work":
      return config.workDuration * 60;
    case "shortBreak":
      return config.shortBreakDuration * 60;
    case "longBreak":
      return config.longBreakDuration * 60;
  }
}

function computeTimeRemaining(
  state: Pick<PomodoroState, "isRunning" | "startedAt" | "pausedTimeRemaining" | "phase">,
  config: PomodoroConfig
): number {
  const phaseDuration = getDurationForPhase(state.phase, config);

  if (!state.isRunning) {
    return state.pausedTimeRemaining ?? phaseDuration;
  }

  if (state.startedAt === null) {
    return phaseDuration;
  }

  const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
  return Math.max(0, phaseDuration - elapsed);
}

function recordCompletedWorkSession(state: PomodoroState & { config: PomodoroConfig }) {
  if (state.phase !== "work") return;
  const durationSec = state.config.workDuration * 60;
  const endedAt = Date.now();
  const startedAt = state.startedAt ?? endedAt - durationSec * 1000;
  useSessionLogStore.getState().recordSession({
    phase: "work",
    startedAt,
    endedAt,
    durationSec,
    presetId: state.activePresetId,
  });
}

function recordOvertimeSession(
  state: PomodoroState & { config: PomodoroConfig },
  overtime: OvertimeState,
  capped: boolean
) {
  const durationSec = state.config.workDuration * 60;
  const endedAt = Date.now();
  const startedAt = state.startedAt ?? overtime.startedAt - durationSec * 1000;
  const accumulated = Math.floor(overtime.accumulatedSec);
  const wallElapsedSec = Math.floor((endedAt - overtime.startedAt) / 1000);
  const overtimeSec = Math.min(accumulated, OVERTIME_CAP_SEC);
  const idleSec = Math.max(0, wallElapsedSec - accumulated);
  useSessionLogStore.getState().recordSession({
    phase: "work",
    startedAt,
    endedAt,
    durationSec,
    presetId: state.activePresetId,
    overtimeSec,
    idleSec,
    cappedAt60m: capped,
  });
}

function completePhase(state: Pick<PomodoroState, "phase" | "completedPomodoros"> & { config: PomodoroConfig }) {
  const { phase, completedPomodoros, config } = state;
  const newCompleted = phase === "work" ? completedPomodoros + 1 : completedPomodoros;
  const nextPhase = getNextPhase(phase, completedPomodoros, config.pomodorosUntilLongBreak);
  return {
    phase: nextPhase,
    isRunning: false,
    completedPomodoros: newCompleted,
    startedAt: null,
    pausedTimeRemaining: null,
    overtime: null,
  } as const;
}

type SetFn = (partial: Partial<PomodoroStore>) => void;

function startOvertime(state: PomodoroStore, set: SetFn) {
  const now = Date.now();
  set({
    overtime: {
      startedAt: now,
      accumulatedSec: 0,
      lastActiveAt: now,
      isIdle: false,
      firedAlarmsSec: [],
    },
    phaseEndPulse: state.phaseEndPulse + 1,
  });
}

function finishWorkPhase(state: PomodoroStore, set: SetFn) {
  recordCompletedWorkSession(state);
  set({ ...completePhase(state), phaseEndPulse: state.phaseEndPulse + 1 });
}

function endOvertime(
  state: PomodoroStore,
  set: SetFn,
  capped: boolean,
  accumulatedSecOverride?: number,
  options?: { skipPhaseEndPulse?: boolean },
) {
  const overtime = state.overtime;
  if (overtime === null) return;
  const final = accumulatedSecOverride !== undefined
    ? { ...overtime, accumulatedSec: accumulatedSecOverride }
    : overtime;
  recordOvertimeSession(state, final, capped);
  const next = completePhase(state);
  if (options?.skipPhaseEndPulse) {
    set(next);
  } else {
    set({ ...next, phaseEndPulse: state.phaseEndPulse + 1 });
  }
}

type OldPomodoroState = {
  phase: PomodoroPhase;
  timeRemaining: number;
  isRunning: boolean;
  completedPomodoros: number;
  config: PomodoroConfig;
};

function migrateState(persistedState: unknown, version: number): PomodoroStore {
  let state = persistedState as Record<string, unknown>;

  if (version === 0 || version === 1) {
    const old = state as unknown as OldPomodoroState;
    state = {
      ...old,
      startedAt: null,
      pausedTimeRemaining: old.timeRemaining,
      isRunning: false,
    };
  }

  if (version < 3) {
    state = { ...state, activePresetId: "25:5" as PomodoroPresetId };
  }

  if (version < 4) {
    state = { ...state, notificationsEnabled: false };
  }

  if (version < 5) {
    state = { ...state, notificationsEnabled: true };
  }

  if (version < 6) {
    state = { ...state, overtime: null, phaseEndPulse: 0 };
  }

  if (version < 7) {
    const overtime = (state as { overtime?: OvertimeState | null }).overtime ?? null;
    const overtimeWithAlarms = overtime
      ? { ...overtime, firedAlarmsSec: overtime.firedAlarmsSec ?? [] }
      : null;
    state = {
      ...state,
      overtime: overtimeWithAlarms,
      overtimeAlarmPulse: 0,
      lastOvertimeAlarmThresholdSec: null,
    };
  }

  return state as unknown as PomodoroStore;
}

export function usePomodoroStore(instanceId: string, config: PomodoroConfig) {
  const store = useMemo(() => {
    const initialState: PomodoroStore = {
      phase: "work",
      isRunning: false,
      completedPomodoros: 0,
      startedAt: null,
      pausedTimeRemaining: null,
      activePresetId: "25:5",
      notificationsEnabled: true,
      overtime: null,
      phaseEndPulse: 0,
      overtimeAlarmPulse: 0,
      lastOvertimeAlarmThresholdSec: null,
      config,

      start: () => {},
      pause: () => {},
      reset: () => {},
      skip: () => {},
      tick: () => {},
      syncTime: () => null,
      getTimeRemaining: () => 0,
      setPreset: () => {},
      setNotificationsEnabled: () => {},
      enterOvertime: () => {},
      pollIdle: () => {},
      stopOvertime: () => {},
      autoStopOvertime: () => {},
      getOvertimeElapsed: () => 0,
    };

    return createWidgetStore<PomodoroStore>(
      instanceId,
      initialState,
      (set, get) => ({
        ...initialState,

        getTimeRemaining: () => {
          const state = get();
          return computeTimeRemaining(state, state.config);
        },

        getOvertimeElapsed: () => {
          const { overtime } = get();
          if (overtime === null) return 0;
          if (overtime.isIdle) return Math.floor(overtime.accumulatedSec);
          const liveSec =
            overtime.accumulatedSec + (Date.now() - overtime.lastActiveAt) / 1000;
          return Math.floor(Math.max(0, liveSec));
        },

        start: () => {
          const state = get();
          const currentRemaining = computeTimeRemaining(state, state.config);
          const phaseDuration = getDurationForPhase(state.phase, state.config);
          const elapsedBeforePause = phaseDuration - currentRemaining;
          const startedAt = Date.now() - elapsedBeforePause * 1000;

          set({
            isRunning: true,
            startedAt,
            pausedTimeRemaining: null,
          });
        },

        pause: () => {
          const state = get();
          if (state.overtime !== null) return;
          const remaining = computeTimeRemaining(state, state.config);
          set({
            isRunning: false,
            pausedTimeRemaining: remaining,
            startedAt: null,
          });
        },

        reset: () => {
          set({
            isRunning: false,
            startedAt: null,
            pausedTimeRemaining: null,
            overtime: null,
          });
        },

        skip: () => {
          const state = get();
          if (state.overtime !== null) return;
          recordCompletedWorkSession(state);
          set(completePhase(state));
        },

        tick: () => {
          const state = get();
          if (state.overtime !== null) return;
          if (!state.isRunning) return;

          const remaining = computeTimeRemaining(state, state.config);
          if (remaining > 0) return;

          if (state.phase === "work" && OVERTIME_AVAILABLE) {
            startOvertime(state, set);
            return;
          }

          finishWorkPhase(state, set);
        },

        syncTime: (): PomodoroPhase | null => {
          const state = get();
          if (state.overtime !== null) return null;
          if (!state.isRunning) return null;

          const remaining = computeTimeRemaining(state, state.config);
          if (remaining > 0) return null;

          if (state.phase === "work" && OVERTIME_AVAILABLE) {
            startOvertime(state, set);
            return null;
          }

          finishWorkPhase(state, set);
          return state.phase;
        },

        setPreset: (presetId: PomodoroPresetId, newConfig: PomodoroConfig) => {
          set({
            config: newConfig,
            activePresetId: presetId,
            phase: "work",
            isRunning: false,
            startedAt: null,
            pausedTimeRemaining: null,
            overtime: null,
          });
        },

        setNotificationsEnabled: (enabled: boolean) => {
          set({ notificationsEnabled: enabled });
        },

        enterOvertime: () => {
          const state = get();
          if (state.overtime !== null) return;
          startOvertime(state, set);
        },

        pollIdle: (idleSec: number) => {
          const state = get();
          const overtime = state.overtime;
          if (overtime === null) return;
          if (!Number.isFinite(idleSec) || idleSec < 0) return;

          const now = Date.now();
          const lastInput = now - idleSec * 1000;
          let { accumulatedSec, lastActiveAt, isIdle } = overtime;

          if (isIdle) {
            if (idleSec < OVERTIME_IDLE_THRESHOLD_SEC) {
              isIdle = false;
              lastActiveAt = lastInput;
            }
          } else {
            const delta = Math.max(0, (lastInput - lastActiveAt) / 1000);
            accumulatedSec += delta;
            lastActiveAt = lastInput;
            if (idleSec >= OVERTIME_IDLE_THRESHOLD_SEC) {
              isIdle = true;
            }
          }

          const previouslyFired = overtime.firedAlarmsSec;
          const newlyFired = OVERTIME_ALARM_THRESHOLDS_SEC.filter(
            (t) => accumulatedSec >= t && !previouslyFired.includes(t),
          );
          const firedAlarmsSec =
            newlyFired.length > 0 ? [...previouslyFired, ...newlyFired] : previouslyFired;
          const alarmDelta = newlyFired.length > 0 ? 1 : 0;
          const latestThreshold =
            newlyFired.length > 0
              ? newlyFired[newlyFired.length - 1]
              : state.lastOvertimeAlarmThresholdSec;

          if (accumulatedSec >= OVERTIME_CAP_SEC) {
            set({
              overtime: {
                startedAt: overtime.startedAt,
                accumulatedSec,
                lastActiveAt,
                isIdle,
                firedAlarmsSec,
              },
              overtimeAlarmPulse: state.overtimeAlarmPulse + alarmDelta,
              lastOvertimeAlarmThresholdSec: latestThreshold,
            });
            endOvertime(get(), set, true, OVERTIME_CAP_SEC, { skipPhaseEndPulse: true });
            return;
          }

          set({
            overtime: {
              startedAt: overtime.startedAt,
              accumulatedSec,
              lastActiveAt,
              isIdle,
              firedAlarmsSec,
            },
            overtimeAlarmPulse: state.overtimeAlarmPulse + alarmDelta,
            lastOvertimeAlarmThresholdSec: latestThreshold,
          });
        },

        stopOvertime: () => {
          endOvertime(get(), set, false);
        },

        autoStopOvertime: () => {
          const state = get();
          const overtime = state.overtime;
          if (overtime === null) return;
          endOvertime(
            state,
            set,
            true,
            Math.min(overtime.accumulatedSec, OVERTIME_CAP_SEC),
          );
        },
      }),
      {
        name: "pomodoro",
        persist: true,
        version: STORE_VERSION,
        migrate: migrateState,
      }
    );
  }, [instanceId, config]);

  return store;
}
