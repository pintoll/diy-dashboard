// Persisted pomodoro work-session record. Mirrors the renderer's
// `PomodoroSessionRecord` (entities/pomodoro-session) across the IPC boundary;
// the two are kept structurally identical by hand, the same split the finance
// types use (main-local type here, an ambient DTO in electron-env.d.ts for the
// renderer). The renderer owns the richer union types; over IPC everything is
// plain JSON.
export type PomodoroFocusMode = "focus" | "leisure";

export interface PomodoroSession {
  id: string;
  phase: "work";
  startedAt: number;
  endedAt: number;
  durationSec: number;
  presetId: string;
  overtimeSec: number;
  idleSec: number;
  intendedMode: PomodoroFocusMode | null;
  attention: PomodoroFocusMode;
  attentionSource: "auto" | "user";
  sessionEndType: "completed" | "early-stop";
  processBuckets: Record<string, number>;
  cappedAt60m: boolean;
  todoId: string | null;
  note: string | null;
}
