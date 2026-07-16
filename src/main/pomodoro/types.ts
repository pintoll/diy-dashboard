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
  // Union of todos on the desk at any point in the session; stored as a JSON
  // array text column (todo_ids). See docs/design/multi-pomo-todo.md.
  todoIds: string[];
  note: string | null;
}
