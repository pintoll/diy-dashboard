// Timer math shared by the renderer pomodoro store (the authority) and the main
// process bridge that answers GET /api/pomodoro.
//
// These two used to be hand-copied across the process boundary with a "mirrors
// the renderer store" comment and nothing enforcing it: change the idle rule or
// the flooring on one side and `dyd pomo` drifts from what the widget shows,
// silently. One module, imported by both, is the enforcement.
//
// Pure by construction — `now` is an argument, the same convention the
// desk-attribution engine uses, so neither caller owns the clock and both are
// testable against a fixed one.

export type TimerInput = {
  isRunning: boolean;
  startedAt: number | null;
  // The frozen remainder while paused; null when the phase has not started.
  pausedTimeRemaining: number | null;
};

export type OvertimeInput = {
  accumulatedSec: number;
  lastActiveAt: number;
  isIdle: boolean;
};

// Seconds left in the current phase, floored, never negative. A running phase is
// derived from `startedAt` rather than counted down, so a missed tick or a
// suspended machine cannot make the clock lie.
export function computeRemainingSec(
  state: TimerInput,
  phaseDurationSec: number,
  now: number
): number {
  if (!state.isRunning) return state.pausedTimeRemaining ?? phaseDurationSec;
  if (state.startedAt === null) return phaseDurationSec;
  const elapsed = Math.floor((now - state.startedAt) / 1000);
  return Math.max(0, phaseDurationSec - elapsed);
}

// Overtime elapsed with idle time excluded. While idle the clock is stopped, so
// the accumulated total reads back unchanged; while active it accrues from the
// last recorded input.
export function computeOvertimeElapsedSec(
  overtime: OvertimeInput | null,
  now: number
): number {
  if (overtime === null) return 0;
  if (overtime.isIdle) return Math.floor(overtime.accumulatedSec);
  const liveSec = overtime.accumulatedSec + (now - overtime.lastActiveAt) / 1000;
  return Math.floor(Math.max(0, liveSec));
}
