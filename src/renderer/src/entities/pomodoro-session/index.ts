export type {
  PomodoroPhase,
  PomodoroPresetId,
  PomodoroPreset,
  PomodoroConfig,
  PomodoroSessionRecord,
  FocusMode,
  AttentionVerdict,
  AttentionSource,
} from "./model/pomodoro-session.types";

export { POMODORO_PRESETS } from "./model/pomodoro-session.types";

export { useSessionLogStore } from "./model/use-session-log-store";

export type {
  HeatmapCell,
  HeatmapLevel,
  WeeklyHours,
  WeeklyHoursComparison,
  LifetimeStats,
  IntentOutcomeCell,
  IntentOutcomeMatrix,
  HourBucket,
  AppUsage,
} from "./model/aggregations";
export {
  countToday,
  countThisWeek,
  computeCurrentStreak,
  buildHeatmapCells,
  weeklyActiveHours,
  lifetimeStats,
  intentOutcomeMatrix,
  timeOfDayPattern,
  appBreakdown,
} from "./model/aggregations";
