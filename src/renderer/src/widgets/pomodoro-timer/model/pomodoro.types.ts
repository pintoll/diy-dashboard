// Domain types — re-exported from entities
export type {
  PomodoroPhase,
  PomodoroPresetId,
  PomodoroPreset,
  PomodoroConfig,
  AttentionVerdict,
  AttentionSource,
} from "@/src/entities/pomodoro-session";

export { POMODORO_PRESETS } from "@/src/entities/pomodoro-session";

// Widget-specific state types (local to this widget)
import type {
  AttentionSource,
  AttentionVerdict,
  PomodoroPhase,
  PomodoroPresetId,
  PomodoroConfig,
  PomodoroSessionRecord,
} from "@/src/entities/pomodoro-session";

export type OvertimeState = {
  startedAt: number;
  accumulatedSec: number;
  lastActiveAt: number;
  isIdle: boolean;
};

export type PendingReview = Omit<
  PomodoroSessionRecord,
  "id" | "phase" | "attention" | "attentionSource"
>;

export type ConfirmReviewInput = {
  attention: AttentionVerdict;
  attentionSource: AttentionSource;
  overtimeSec: number;
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
  lastOvertimeAlarmThresholdSec: number | null;
  pendingReview: PendingReview | null;
  processBuckets: Record<string, number>;
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
  confirmReview: (input: ConfirmReviewInput) => void;
  getOvertimeElapsed: () => number;
  addToBucket: (exeName: string, seconds: number) => void;
  addLeisureProcess: (exeName: string) => void;
  removeLeisureProcess: (exeName: string) => void;
};
