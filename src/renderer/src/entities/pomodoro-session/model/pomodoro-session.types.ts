import type { FocusMode } from "@/src/shared/types";

export type PomodoroPhase = "work" | "shortBreak" | "longBreak";

export type PomodoroPresetId = "25:5" | "50:10" | "100:20" | "120:30" | "custom";

export type PomodoroPreset = {
  id: PomodoroPresetId;
  label: string;
  workDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
};

export const POMODORO_PRESETS: PomodoroPreset[] = [
  { id: "25:5", label: "25 : 5", workDuration: 25, shortBreakDuration: 5, longBreakDuration: 15 },
  { id: "50:10", label: "50 : 10", workDuration: 50, shortBreakDuration: 10, longBreakDuration: 30 },
  { id: "100:20", label: "100 : 20", workDuration: 100, shortBreakDuration: 20, longBreakDuration: 60 },
  { id: "120:30", label: "120 : 30", workDuration: 120, shortBreakDuration: 30, longBreakDuration: 90 },
];

export type PomodoroConfig = {
  workDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  pomodorosUntilLongBreak: number;
  leisureProcesses: string[];
  detectionEnabled: boolean;
  chimeEnabled: boolean;
  flashEnabled: boolean;
};

// Binary focus/leisure label on both axes (intent at start, outcome at end).
// The single source of truth lives in shared/types; the legacy `mixed` verdict
// has been removed so the diagnosis analysis is a clean 2x2 (see
// docs/wip/focus-analytics-page.md). Re-exported here for existing consumers.
export type { FocusMode };
// Deprecated alias kept so existing consumers keep compiling; prefer FocusMode.
export type AttentionVerdict = FocusMode;
export type AttentionSource = "auto" | "user";

// How the work session ended. completed = the work timer reached 0 (natural
// finish, skip, or any overtime exit — the core block was completed).
// early-stop = stopped with time still on the clock (the temptation surrender
// the early-stop / collapse metrics exist to catch).
export type SessionEndType = "completed" | "early-stop";

export type PomodoroSessionRecord = {
  id: string;
  phase: "work";
  startedAt: number;
  endedAt: number;
  durationSec: number;
  presetId: PomodoroPresetId;
  overtimeSec: number;
  idleSec: number;
  // Intent declared at session start, immutable. null = legacy / not declared
  // (never backfilled — a fake intent would pollute collapse analysis).
  intendedMode: FocusMode | null;
  // Outcome verdict at session end (auto-computed or user-overridden).
  attention: FocusMode;
  attentionSource: AttentionSource;
  sessionEndType: SessionEndType;
  processBuckets: Record<string, number>;
  cappedAt60m: boolean;
  // Snapshot of the globally active todo at session end (same snapshot rule
  // as `intendedMode`). null = no todo was active / legacy record. The todo's
  // accrued worked_sec lives in SQLite; this is the renderer-side link.
  todoId: string | null;
  // Optional free-text memo for "that day, why?" context, authored after the
  // fact in the analytics day drill-down. null = no note (same null-as-absent
  // convention as `intendedMode`).
  note: string | null;
};
