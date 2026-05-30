// Domain types — re-exported from entities
export type {
  PomodoroPhase,
  PomodoroPresetId,
  PomodoroPreset,
  PomodoroConfig,
  FocusMode,
  AttentionVerdict,
  AttentionSource,
} from "@/src/entities/pomodoro-session";

export { POMODORO_PRESETS } from "@/src/entities/pomodoro-session";

// Widget-specific state types (local to this widget)
import type {
  AttentionSource,
  AttentionVerdict,
  FocusMode,
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

export type ConfigFlagKey = "detectionEnabled" | "chimeEnabled" | "flashEnabled";

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
  // Intent declared before the work session starts; recorded as the session's
  // intendedMode. Immutable once a session is running.
  intendedMode: FocusMode;
};

export type PomodoroActions = {
  start: () => void;
  pause: () => void;
  reset: () => void;
  stop: () => void;
  skip: () => void;
  tick: () => void;
  syncTime: () => PomodoroPhase | null;
  getTimeRemaining: () => number;
  setPreset: (presetId: PomodoroPresetId, config: PomodoroConfig) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setConfigFlag: (key: ConfigFlagKey, enabled: boolean) => void;
  setIntendedMode: (mode: FocusMode) => void;
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
