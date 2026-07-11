// Structural view of a recorded pomodoro work session — the exact fields the
// accrual needs. Kept structural instead of importing the pomodoro-session
// entity so the two entities stay decoupled; PomodoroSessionRecord satisfies
// it as-is.
export type WorkSessionLike = {
  id: string;
  todoId: string | null;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  overtimeSec: number;
};

/**
 * Accrues a finished work session onto its linked todo in SQLite.
 * Fire-and-forget: the pomodoro session log is the primary record and must
 * never be blocked by the accrual write. workedSec is the planned block plus
 * real overtime (idle is already excluded at record time) — the same formula
 * as `sessionActiveSec` in the analytics aggregations.
 */
export function accrueTodoWork(session: WorkSessionLike): void {
  if (session.todoId === null) return;
  const api = window.electronAPI?.todos;
  if (!api) return;

  api
    .recordWork({
      todoId: session.todoId,
      sessionId: session.id,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      workedSec: session.durationSec + session.overtimeSec,
    })
    .catch((error) => {
      // The todo may have been deleted between activation and session end;
      // losing the accrual is acceptable, losing the session record is not.
      console.warn("todo work accrual failed:", error);
    });
}
