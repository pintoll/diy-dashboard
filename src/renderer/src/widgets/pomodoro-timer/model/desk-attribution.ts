// Pure interval-attribution engine for the pomodoro "desk".
//
// The desk is the set of todos currently receiving the running work clock (see
// docs/design/multi-pomo-todo.md). This module owns the *interval boundaries*:
// while a work pomo runs, each desk member has one open interval; closing an
// interval banks one `recordWork` call. Time is NOT divided across members —
// each open member independently accrues the full wall-clock overlap, so two
// todos worked in the same 25 minutes each read 25 minutes.
//
// It is deliberately free of Date, React, and I/O: every timestamp is an epoch
// ms passed in by the caller, so the store owns "now" and this file is a pure,
// unit-testable reducer over interval events.

// One banked interval — the exact shape `todos.recordWork` needs. `workedSec`
// is the block wall-clock overlap plus any overtime bonus applied at session
// end. `attributionId` is stable per interval so a retried write can't double
// count (the ledger is INSERT OR IGNORE on it).
export type AttributionBank = {
  attributionId: string;
  sessionId: string;
  todoId: string;
  startedAt: number;
  endedAt: number;
  workedSec: number;
};

// An open (still-accruing) interval for one desk member. `seq` disambiguates a
// todo that leaves and rejoins within one session: each stint is a distinct
// interval, so `${sessionId}:${todoId}:${seq}` stays unique per stint.
type OpenInterval = {
  todoId: string;
  seq: number;
  startMs: number;
};

export type AttributionState = {
  // The work session id, stable for the whole block (survives pause/resume).
  // null when no work block is active.
  sessionId: string | null;
  // Wall-clock instant the work timer reaches 0. Block overlap is capped here,
  // so time spent in overtime is never double-counted as block time. Shifts
  // later by the paused duration on resume.
  phaseEndMs: number;
  open: OpenInterval[];
  // Next `seq` to hand out per todo, so stints get monotonic ids across the
  // whole session even after a member leaves the `open` list.
  seqByTodo: Record<string, number>;
};

type Result = { state: AttributionState; banks: AttributionBank[] };

export function initialAttribution(): AttributionState {
  return { sessionId: null, phaseEndMs: 0, open: [], seqByTodo: {} };
}

// Wall-clock seconds an interval overlapped the work block: from its (already
// clamped) start until it closed, but never past the phase end — overtime is
// accounted separately. Floored, and never negative (a member that only ever
// existed in overtime banks 0 block seconds).
function blockOverlapSec(startMs: number, closeMs: number, phaseEndMs: number): number {
  const end = Math.min(closeMs, phaseEndMs);
  return Math.max(0, Math.floor((end - startMs) / 1000));
}

// The share of `overtimeSec` an interval is entitled to. Overtime runs in the
// window [phaseEndMs, closeMs]; an interval that opened partway through it was
// only present for the tail, so it cannot bank the whole total. Clamped by that
// wall-clock presence rather than divided, matching the block rule — but never
// above the total, which is already idle-excluded and capped.
//
// `closeMs <= phaseEndMs` means there is no overtime window at all: the session
// ended before the timer ran out, so any `overtimeSec` here is the user's manual
// top-up from the review dialog. That applies to the whole session, so it is
// credited in full to everyone still open, as before.
function overtimeShareSec(
  startMs: number,
  closeMs: number,
  phaseEndMs: number,
  overtimeSec: number
): number {
  const total = Math.max(0, Math.floor(overtimeSec));
  if (total === 0 || closeMs <= phaseEndMs) return total;
  const presentFrom = Math.max(startMs, phaseEndMs);
  const presentSec = Math.max(0, Math.floor((closeMs - presentFrom) / 1000));
  return Math.min(total, presentSec);
}

function bankInterval(
  state: AttributionState,
  interval: OpenInterval,
  closeMs: number,
  overtimeSec: number
): AttributionBank {
  const blockSec = blockOverlapSec(interval.startMs, closeMs, state.phaseEndMs);
  const otSec = overtimeShareSec(interval.startMs, closeMs, state.phaseEndMs, overtimeSec);
  return {
    attributionId: `${state.sessionId}:${interval.todoId}:${interval.seq}`,
    sessionId: state.sessionId as string,
    todoId: interval.todoId,
    startedAt: interval.startMs,
    endedAt: closeMs,
    workedSec: blockSec + otSec,
  };
}

// Begin a fresh work block. Discards any prior state (the caller guarantees no
// interval is left open). Members present at the start open at `blockStartMs`.
export function startBlock(params: {
  sessionId: string;
  blockStartMs: number;
  phaseEndMs: number;
  members: string[];
}): Result {
  const seqByTodo: Record<string, number> = {};
  const open: OpenInterval[] = [];
  for (const todoId of params.members) {
    if (seqByTodo[todoId] !== undefined) continue; // ignore duplicate members
    open.push({ todoId, seq: 0, startMs: params.blockStartMs });
    seqByTodo[todoId] = 1;
  }
  return {
    state: {
      sessionId: params.sessionId,
      phaseEndMs: params.phaseEndMs,
      open,
      seqByTodo,
    },
    banks: [],
  };
}

// Reconcile the open intervals against the current desk membership. Members
// that left bank their interval (block-only, no overtime); members that joined
// open a fresh interval at `at`. Members present in both keep their interval
// (and its start), so a no-op sync is idempotent. Used mid-block for
// join / complete / remove / clear.
export function syncDesk(state: AttributionState, params: { members: string[]; at: number }): Result {
  if (state.sessionId === null) return { state, banks: [] };

  const wanted = new Set(params.members);
  const banks: AttributionBank[] = [];
  const kept: OpenInterval[] = [];
  for (const interval of state.open) {
    if (wanted.has(interval.todoId)) {
      kept.push(interval);
    } else {
      banks.push(bankInterval(state, interval, params.at, 0));
    }
  }

  const seqByTodo = { ...state.seqByTodo };
  const openIds = new Set(kept.map((i) => i.todoId));
  const open = [...kept];
  for (const todoId of params.members) {
    if (openIds.has(todoId)) continue;
    const seq = seqByTodo[todoId] ?? 0;
    seqByTodo[todoId] = seq + 1;
    open.push({ todoId, seq, startMs: params.at });
    openIds.add(todoId);
  }

  return { state: { ...state, open, seqByTodo }, banks };
}

// Pause: bank and close every open interval (block-only), keeping the session
// meta and seq counters so resume opens fresh intervals with new ids.
export function pauseBlock(state: AttributionState, params: { at: number }): Result {
  if (state.sessionId === null) return { state, banks: [] };
  const banks = state.open.map((interval) => bankInterval(state, interval, params.at, 0));
  return { state: { ...state, open: [] }, banks };
}

// Resume after a pause: reopen an interval per current desk member at `at`, and
// adopt the shifted phase end (the block gained the paused duration).
export function resumeBlock(
  state: AttributionState,
  params: { at: number; phaseEndMs: number; members: string[] }
): Result {
  if (state.sessionId === null) return { state, banks: [] };
  const seqByTodo = { ...state.seqByTodo };
  const open: OpenInterval[] = [];
  const seen = new Set<string>();
  for (const todoId of params.members) {
    if (seen.has(todoId)) continue;
    const seq = seqByTodo[todoId] ?? 0;
    seqByTodo[todoId] = seq + 1;
    open.push({ todoId, seq, startMs: params.at });
    seen.add(todoId);
  }
  return { state: { ...state, phaseEndMs: params.phaseEndMs, open, seqByTodo }, banks: [] };
}

// End the block (phase complete / stop / skip / overtime end): bank every
// still-open interval and reset. `overtimeSec` is added on top without division,
// matching the block rule — but only up to each member's own presence in the
// overtime window (see `overtimeShareSec`), so a late joiner cannot bank an hour
// of overtime for a minute on the desk.
export function endBlock(state: AttributionState, params: { at: number; overtimeSec: number }): Result {
  if (state.sessionId === null) return { state: initialAttribution(), banks: [] };
  const banks = state.open.map((interval) =>
    bankInterval(state, interval, params.at, params.overtimeSec)
  );
  return { state: initialAttribution(), banks };
}
