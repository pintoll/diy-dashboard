"use client";

import { useMemo } from "react";
import { createWidgetStore } from "@/src/shared/lib/create-widget-store";
import type {
  PomodoroConfig,
  PomodoroPhase,
  PomodoroState,
  PomodoroActions,
} from "./pomodoro.types";

type PomodoroStore = PomodoroState & PomodoroActions & { config: PomodoroConfig };

const STORE_VERSION = 2;

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

type OldPomodoroState = {
  phase: PomodoroPhase;
  timeRemaining: number;
  isRunning: boolean;
  completedPomodoros: number;
  config: PomodoroConfig;
};

function migrateState(persistedState: unknown, version: number): PomodoroStore {
  if (version === 0 || version === 1) {
    const old = persistedState as OldPomodoroState;
    return {
      ...old,
      startedAt: null,
      pausedTimeRemaining: old.timeRemaining,
      isRunning: false,
      start: () => {},
      pause: () => {},
      reset: () => {},
      skip: () => {},
      tick: () => {},
      syncTime: () => {},
      getTimeRemaining: () => 0,
    };
  }
  return persistedState as PomodoroStore;
}

export function usePomodoroStore(instanceId: string, config: PomodoroConfig) {
  const store = useMemo(() => {
    const initialState: PomodoroStore = {
      phase: "work",
      isRunning: false,
      completedPomodoros: 0,
      startedAt: null,
      pausedTimeRemaining: null,
      config,

      start: () => {},
      pause: () => {},
      reset: () => {},
      skip: () => {},
      tick: () => {},
      syncTime: () => {},
      getTimeRemaining: () => 0,
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
          });
        },

        skip: () => {
          const { phase, completedPomodoros, config } = get();
          const newCompleted =
            phase === "work" ? completedPomodoros + 1 : completedPomodoros;
          const nextPhase = getNextPhase(
            phase,
            completedPomodoros,
            config.pomodorosUntilLongBreak
          );
          set({
            phase: nextPhase,
            isRunning: false,
            completedPomodoros: newCompleted,
            startedAt: null,
            pausedTimeRemaining: null,
          });
        },

        tick: () => {
          const state = get();
          if (!state.isRunning) return;

          const remaining = computeTimeRemaining(state, state.config);

          if (remaining <= 0) {
            const { phase, completedPomodoros, config } = state;
            const newCompleted =
              phase === "work" ? completedPomodoros + 1 : completedPomodoros;
            const nextPhase = getNextPhase(
              phase,
              completedPomodoros,
              config.pomodorosUntilLongBreak
            );
            set({
              phase: nextPhase,
              isRunning: false,
              completedPomodoros: newCompleted,
              startedAt: null,
              pausedTimeRemaining: null,
            });
          }
        },

        syncTime: () => {
          const state = get();
          if (!state.isRunning) return;

          const remaining = computeTimeRemaining(state, state.config);

          if (remaining <= 0) {
            const { phase, completedPomodoros, config } = state;
            const newCompleted =
              phase === "work" ? completedPomodoros + 1 : completedPomodoros;
            const nextPhase = getNextPhase(
              phase,
              completedPomodoros,
              config.pomodorosUntilLongBreak
            );
            set({
              phase: nextPhase,
              isRunning: false,
              completedPomodoros: newCompleted,
              startedAt: null,
              pausedTimeRemaining: null,
            });
          }
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
