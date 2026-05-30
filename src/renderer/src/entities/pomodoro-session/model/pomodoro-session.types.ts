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

export type AttentionVerdict = "focus" | "leisure" | "mixed";
export type AttentionSource = "auto" | "user";

export type PomodoroSessionRecord = {
  id: string;
  phase: "work";
  startedAt: number;
  endedAt: number;
  durationSec: number;
  presetId: PomodoroPresetId;
  overtimeSec: number;
  idleSec: number;
  // Declared at session start, immutable. null for legacy records predating the
  // focus-mode feature — never backfilled (a fake intent would pollute the
  // intent-vs-outcome 2x2), and excluded from that analysis.
  intendedMode: FocusMode | null;
  attention: AttentionVerdict;
  attentionSource: AttentionSource;
  processBuckets: Record<string, number>;
  cappedAt60m: boolean;
};
