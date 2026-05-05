// Domain types — re-exported from entities
export type {
  PomodoroPhase,
  PomodoroPresetId,
  PomodoroPreset,
  PomodoroConfig,
} from "@/src/entities/pomodoro-session";

export { POMODORO_PRESETS } from "@/src/entities/pomodoro-session";

// Widget-specific state types (local to this widget)
import type { PomodoroPhase, PomodoroPresetId, PomodoroConfig } from "@/src/entities/pomodoro-session";

export type OvertimeState = {
  startedAt: number;
  accumulatedSec: number;
  lastActiveAt: number;
  isIdle: boolean;
  firedAlarmsSec: number[];
};

export type PomodoroState = {
  phase: PomodoroPhase;
  isRunning: boolean;
  completedPomodoros: number;
  startedAt: number | null;
  pausedTimeRemaining: number | null;
  activePresetId: PomodoroPresetId;
  notificationsEnabled: boolean;
  overtime: OvertimeState | null;
  phaseEndPulse: number;
  overtimeAlarmPulse: number;
  lastOvertimeAlarmThresholdSec: number | null;
};

export type PomodoroActions = {
  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => void;
  tick: () => void;
  syncTime: () => PomodoroPhase | null;
  getTimeRemaining: () => number;
  setPreset: (presetId: PomodoroPresetId, config: PomodoroConfig) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  enterOvertime: () => void;
  pollIdle: (idleSec: number) => void;
  stopOvertime: () => void;
  autoStopOvertime: () => void;
  getOvertimeElapsed: () => number;
};
