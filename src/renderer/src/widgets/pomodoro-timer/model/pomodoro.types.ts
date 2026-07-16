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
  PomodoroPhase,
  PomodoroPresetId,
  PomodoroConfig,
  PomodoroSessionRecord,
} from "@/src/entities/pomodoro-session";
import type { AttributionState } from "./desk-attribution";

export type OvertimeState = {
  startedAt: number;
  accumulatedSec: number;
  lastActiveAt: number;
  isIdle: boolean;
};

// `note` is authored later in the analytics day drill-down, never during the
// review flow, so it is not part of the pending review.
export type PendingReview = Omit<
  PomodoroSessionRecord,
  "id" | "phase" | "attention" | "attentionSource" | "note"
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
  // Interval-attribution bookkeeping for the desk (docs/design/multi-pomo-todo.md).
  // Runtime state owned by the store; the pure engine lives in desk-attribution.ts.
  attribution: AttributionState;
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
  enterOvertime: () => void;
  pollIdle: (idleSec: number) => void;
  // Reconcile the open intervals against the current desk membership. Called by
  // DeskAttributionController when the desk changes while a work pomo accrues.
  syncDesk: () => void;
  stopOvertime: () => void;
  autoStopOvertime: () => void;
  confirmReview: (input: ConfirmReviewInput) => void;
  getOvertimeElapsed: () => number;
  addToBucket: (exeName: string, seconds: number) => void;
  addLeisureProcess: (exeName: string) => void;
  removeLeisureProcess: (exeName: string) => void;
};
