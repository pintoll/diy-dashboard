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

export function usePomodoroStore(instanceId: string, config: PomodoroConfig) {
  const store = useMemo(() => {
    const initialState: PomodoroStore = {
      phase: "work",
      timeRemaining: config.workDuration * 60,
      isRunning: false,
      completedPomodoros: 0,
      config,

      start: () => {},
      pause: () => {},
      reset: () => {},
      skip: () => {},
      tick: () => {},
    };

    return createWidgetStore<PomodoroStore>(
      instanceId,
      initialState,
      (set, get) => ({
        ...initialState,

        start: () => set({ isRunning: true }),

        pause: () => set({ isRunning: false }),

        reset: () => {
          const { config, phase } = get();
          set({
            timeRemaining: getDurationForPhase(phase, config),
            isRunning: false,
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
            timeRemaining: getDurationForPhase(nextPhase, config),
            isRunning: false,
            completedPomodoros: newCompleted,
          });
        },

        tick: () => {
          const { timeRemaining, phase, completedPomodoros, config } = get();

          if (timeRemaining <= 1) {
            const newCompleted =
              phase === "work" ? completedPomodoros + 1 : completedPomodoros;
            const nextPhase = getNextPhase(
              phase,
              completedPomodoros,
              config.pomodorosUntilLongBreak
            );
            set({
              phase: nextPhase,
              timeRemaining: getDurationForPhase(nextPhase, config),
              isRunning: false,
              completedPomodoros: newCompleted,
            });
          } else {
            set({ timeRemaining: timeRemaining - 1 });
          }
        },
      }),
      { name: "pomodoro", persist: true }
    );
  }, [instanceId, config]);

  return store;
}
