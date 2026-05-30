import { useMemo } from "react";
import { createWidgetStore } from "@/src/shared/lib/create-widget-store";
import { useSessionLogStore } from "@/src/entities/pomodoro-session";
import { useFocusModeStore } from "@/src/entities/focus-mode";
import type {
  ConfirmReviewInput,
  PendingReview,
  PomodoroConfig,
  PomodoroPhase,
  PomodoroPresetId,
  PomodoroState,
  PomodoroActions,
  OvertimeState,
} from "./pomodoro.types";

type PomodoroStore = PomodoroState & PomodoroActions & { config: PomodoroConfig };

const STORE_VERSION = 13;
export const OVERTIME_CAP_SEC = 3600;
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
    processBuckets: state.processBuckets,
    intendedMode: useFocusModeStore.getState().intendedMode,
  });
}

function buildPendingReview(
  state: PomodoroState & { config: PomodoroConfig },
  overtime: OvertimeState,
  capped: boolean,
): PendingReview {
  const durationSec = state.config.workDuration * 60;
  const endedAt = Date.now();
  const startedAt = state.startedAt ?? overtime.startedAt - durationSec * 1000;
  const accumulated = Math.floor(overtime.accumulatedSec);
  const wallElapsedSec = Math.floor((endedAt - overtime.startedAt) / 1000);
  const overtimeSec = Math.min(accumulated, OVERTIME_CAP_SEC);
  const idleSec = Math.max(0, wallElapsedSec - accumulated);
  return {
    startedAt,
    endedAt,
    durationSec,
    presetId: state.activePresetId,
    overtimeSec,
    idleSec,
    cappedAt60m: capped,
    // Overtime exits all happen after the work timer already reached 0.
    sessionEndType: "completed",
    processBuckets: state.processBuckets,
    // Snapshot intent at session end: the tab unlocks once the session is over,
    // so the review (confirmed later) must not pick up a post-session flip.
    intendedMode: useFocusModeStore.getState().intendedMode,
  };
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
    },
    phaseEndPulse: state.phaseEndPulse + 1,
    lastOvertimeAlarmThresholdSec: null,
  });
}

function finishWorkPhase(state: PomodoroStore, set: SetFn) {
  recordCompletedWorkSession(state);
  set({
    ...completePhase(state),
    phaseEndPulse: state.phaseEndPulse + 1,
    processBuckets: {},
  });
}

function endOvertime(
  state: PomodoroStore,
  set: SetFn,
  capped: boolean,
  accumulatedSecOverride?: number,
) {
  const overtime = state.overtime;
  if (overtime === null) return;
  const final = accumulatedSecOverride !== undefined
    ? { ...overtime, accumulatedSec: accumulatedSecOverride }
    : overtime;
  const pendingReview = buildPendingReview(state, final, capped);
  set({
    ...completePhase(state),
    phaseEndPulse: state.phaseEndPulse + 1,
    pendingReview,
  });
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
    state = { ...state, lastOvertimeAlarmThresholdSec: null };
  }

  if (version < 8) {
    const prevOvertime = (state as { overtime?: (OvertimeState & { firedAlarmsSec?: number[] }) | null })
      .overtime ?? null;
    const overtime: OvertimeState | null = prevOvertime
      ? {
          startedAt: prevOvertime.startedAt,
          accumulatedSec: prevOvertime.accumulatedSec,
          lastActiveAt: prevOvertime.lastActiveAt,
          isIdle: prevOvertime.isIdle,
        }
      : null;
    const { overtimeAlarmPulse: _drop, ...rest } = state as Record<string, unknown>;
    void _drop;
    state = { ...rest, overtime };
  }

  if (version < 9) {
    state = { ...state, pendingReview: null };
  }

  if (version < 10) {
    state = { ...state, processBuckets: {} };
  }

  if (version < 11) {
    const prevConfig = (state.config ?? {}) as Partial<PomodoroConfig>;
    state = {
      ...state,
      config: {
        ...prevConfig,
        leisureProcesses: prevConfig.leisureProcesses ?? ["brave.exe"],
      },
    };
  }

  if (version < 12) {
    const prevConfig = (state.config ?? {}) as Partial<PomodoroConfig>;
    state = {
      ...state,
      config: {
        ...prevConfig,
        detectionEnabled: prevConfig.detectionEnabled ?? true,
        chimeEnabled: prevConfig.chimeEnabled ?? true,
        flashEnabled: prevConfig.flashEnabled ?? true,
      },
    };
  }

  // Intent declaration moved out of this store into useFocusModeStore (shared
  // with the focus-mode block engine); no per-instance intendedMode to backfill.

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
      lastOvertimeAlarmThresholdSec: null,
      pendingReview: null,
      processBuckets: {},
      config,

      start: () => {},
      pause: () => {},
      reset: () => {},
      stop: () => {},
      skip: () => {},
      tick: () => {},
      syncTime: () => null,
      getTimeRemaining: () => 0,
      setPreset: () => {},
      setNotificationsEnabled: () => {},
      setConfigFlag: () => {},
      enterOvertime: () => {},
      pollIdle: () => {},
      stopOvertime: () => {},
      autoStopOvertime: () => {},
      confirmReview: () => {},
      getOvertimeElapsed: () => 0,
      addToBucket: () => {},
      addLeisureProcess: () => {},
      removeLeisureProcess: () => {},
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

          const isFreshWorkSession =
            state.phase === "work" &&
            state.startedAt === null &&
            state.pausedTimeRemaining === null &&
            state.overtime === null;

          set({
            isRunning: true,
            startedAt,
            pausedTimeRemaining: null,
            ...(isFreshWorkSession ? { processBuckets: {} } : {}),
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
            pendingReview: null,
            processBuckets: {},
          });
        },

        stop: () => {
          const state = get();
          if (state.overtime !== null) return;

          const clearToIdle = () =>
            set({
              isRunning: false,
              startedAt: null,
              pausedTimeRemaining: null,
              processBuckets: {},
            });

          // Only the work phase produces a reviewable session.
          if (state.phase !== "work") {
            clearToIdle();
            return;
          }

          const remaining = computeTimeRemaining(state, state.config);
          const phaseDuration = getDurationForPhase("work", state.config);
          const elapsedSec = Math.max(0, phaseDuration - remaining);

          // Nothing ran yet — just clear back to a fresh work phase.
          if (elapsedSec === 0) {
            clearToIdle();
            return;
          }

          // End the session at the time actually spent and open the review
          // so the user can log feedback for the partial session.
          const endedAt = Date.now();
          const startedAt = state.startedAt ?? endedAt - elapsedSec * 1000;
          const pendingReview: PendingReview = {
            startedAt,
            endedAt,
            durationSec: elapsedSec,
            presetId: state.activePresetId,
            overtimeSec: 0,
            idleSec: 0,
            cappedAt60m: false,
            // Stopped with time still on the clock — the temptation surrender.
            sessionEndType: "early-stop",
            processBuckets: state.processBuckets,
            intendedMode: useFocusModeStore.getState().intendedMode,
          };

          set({
            ...completePhase(state),
            pendingReview,
          });
        },

        skip: () => {
          const state = get();
          if (state.overtime !== null) return;
          recordCompletedWorkSession(state);
          set({ ...completePhase(state), processBuckets: {} });
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
            processBuckets: {},
          });
        },

        setNotificationsEnabled: (enabled: boolean) => {
          set({ notificationsEnabled: enabled });
        },

        setConfigFlag: (key, enabled) => {
          const { config } = get();
          set({ config: { ...config, [key]: enabled } });
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

          const prevThreshold = state.lastOvertimeAlarmThresholdSec ?? 0;
          const reached =
            OVERTIME_ALARM_THRESHOLDS_SEC.findLast((t) => accumulatedSec >= t) ?? null;
          const newlyFired = reached !== null && reached > prevThreshold ? reached : null;
          const lastOvertimeAlarmThresholdSec =
            newlyFired ?? state.lastOvertimeAlarmThresholdSec;

          const nextOvertime: OvertimeState = {
            startedAt: overtime.startedAt,
            accumulatedSec,
            lastActiveAt,
            isIdle,
          };

          if (accumulatedSec >= OVERTIME_CAP_SEC) {
            const pendingReview = buildPendingReview(
              state,
              { ...nextOvertime, accumulatedSec: OVERTIME_CAP_SEC },
              true,
            );
            set({
              ...completePhase(state),
              lastOvertimeAlarmThresholdSec,
              pendingReview,
            });
            return;
          }

          set({ overtime: nextOvertime, lastOvertimeAlarmThresholdSec });
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

        confirmReview: (input: ConfirmReviewInput) => {
          const { pendingReview } = get();
          if (pendingReview === null) return;
          useSessionLogStore.getState().recordSession({
            phase: "work",
            startedAt: pendingReview.startedAt,
            endedAt: pendingReview.endedAt,
            durationSec: pendingReview.durationSec,
            presetId: pendingReview.presetId,
            overtimeSec: Math.max(0, Math.floor(input.overtimeSec)),
            idleSec: pendingReview.idleSec,
            cappedAt60m: pendingReview.cappedAt60m,
            sessionEndType: pendingReview.sessionEndType,
            processBuckets: pendingReview.processBuckets,
            intendedMode: pendingReview.intendedMode,
            attention: input.attention,
            attentionSource: input.attentionSource,
          });
          set({ pendingReview: null, processBuckets: {} });
        },

        addToBucket: (exeName: string, seconds: number) => {
          if (exeName === "" || seconds <= 0) return;
          const state = get();
          if (state.overtime?.isIdle) return;
          set({
            processBuckets: {
              ...state.processBuckets,
              [exeName]: (state.processBuckets[exeName] ?? 0) + seconds,
            },
          });
        },

        addLeisureProcess: (exeName: string) => {
          const trimmed = exeName.trim().toLowerCase();
          if (trimmed === "") return;
          const state = get();
          const existing = state.config.leisureProcesses;
          if (existing.some((p) => p.toLowerCase() === trimmed)) return;
          set({
            config: { ...state.config, leisureProcesses: [...existing, trimmed] },
          });
        },

        removeLeisureProcess: (exeName: string) => {
          const state = get();
          const lower = exeName.toLowerCase();
          const existing = state.config.leisureProcesses;
          const next = existing.filter((p) => p.toLowerCase() !== lower);
          if (next.length === existing.length) return;
          set({ config: { ...state.config, leisureProcesses: next } });
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
