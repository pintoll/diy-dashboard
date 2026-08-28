import type { ProjectTime } from "./types";

// Per-project invested time, derived from the `todo_sessions` ledger. Pure and
// db-free on purpose: better-sqlite3 is built against Electron's ABI and cannot
// load under vitest, so the logic lives here and the query that feeds it lives
// in project-stats.ts (the split fold.ts and day-snapshot.ts already use).
//
// The rule that makes this its own module: the ledger banks one row per desk
// member per in-flight interval, and desk members are NOT divided - each gets
// the full overlap (docs/design/multi-pomo-todo.md). So summing `worked_sec`
// per project double-counts whenever two todos of the same project sit on the
// desk together. Merging the intervals instead answers the honest question,
// "how much wall-clock time was this project on the desk".
//
// Merging runs on each row's *credited* window, `[started_at, started_at +
// worked_sec]`, not on its raw span. The two differ: `worked_sec` is block
// overlap capped at the phase end plus a share of the session's `overtime_sec`,
// which is already idle-excluded and capped, while `ended_at` is simply when
// the interval closed. A real ledger showed the gap - spans over-reported by
// ~0.6% against credited seconds. The uncredited part is the tail (the overtime
// window sits at the end by construction), so the credited window is the head,
// and anchoring there keeps this number in step with `todos.worked_sec` and
// with the page's "active time" everywhere else. It also makes the invariant
// structural rather than lucky: a project's merged seconds can never exceed the
// sum of its own worked_sec.
//
// What merging deliberately does not fix: two *different* projects on the desk
// at once each keep the whole overlap, because that is the desk model's own
// semantic and dividing it would invent an effort allocation. Per-project totals
// can therefore sum past the day's wall clock, which is why the surface reading
// this is a ranked bar list and never a pie.

/** One banked interval, already resolved to the todo's current project. */
export type ProjectInterval = {
  // Null is a real group, not a filter: unfiled work is the inbox, and its time
  // is worth seeing next to the projects it competes with.
  projectId: string | null;
  startedAt: number;
  // When the interval closed. Only an upper bound here - see workedSec.
  endedAt: number;
  // Seconds actually credited to the todo. Shorter than the span whenever the
  // session's overtime was trimmed, idle-excluded or capped.
  workedSec: number;
};

// Null has no string key of its own, so the unfiled group needs one no nanoid
// can collide with.
const UNFILED = " unfiled";

type Credited = { startedAt: number; endedAt: number };

/**
 * The part of an interval that was actually credited: its head, `worked_sec`
 * long. Null when the row carries nothing countable - a non-finite bound, a
 * span that never advanced, or zero credited seconds.
 *
 * `worked_sec` is clamped to the span defensively. It cannot normally exceed
 * it, but a manual overtime top-up entered in the review dialog is credited in
 * full to everyone still open (desk-attribution.ts), which is one path where a
 * row could claim more wall clock than it held.
 */
function creditedWindow(row: ProjectInterval): Credited | null {
  const { startedAt, endedAt, workedSec } = row;
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return null;
  if (!Number.isFinite(workedSec) || workedSec <= 0) return null;
  const span = endedAt - startedAt;
  if (span <= 0) return null;
  return { startedAt, endedAt: startedAt + Math.min(workedSec * 1000, span) };
}

/**
 * Credited wall-clock seconds per project, overlapping windows merged. Input
 * order is irrelevant (each group is sorted here), and a row with nothing to
 * credit contributes nothing rather than a negative.
 */
export function mergeProjectSeconds(rows: ProjectInterval[]): ProjectTime[] {
  const groups = new Map<string, Credited[]>();
  for (const row of rows) {
    const credited = creditedWindow(row);
    if (credited === null) continue;
    const key = row.projectId ?? UNFILED;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [credited]);
    else group.push(credited);
  }

  const out: ProjectTime[] = [];
  for (const [key, group] of groups) {
    group.sort((a, b) => a.startedAt - b.startedAt);
    let ms = 0;
    let start = group[0].startedAt;
    let end = group[0].endedAt;
    for (let i = 1; i < group.length; i++) {
      const next = group[i];
      // Touching intervals merge too: a desk member that left and rejoined at
      // the same instant banked one continuous stretch, not two.
      if (next.startedAt <= end) {
        if (next.endedAt > end) end = next.endedAt;
        continue;
      }
      ms += end - start;
      start = next.startedAt;
      end = next.endedAt;
    }
    ms += end - start;
    out.push({
      projectId: key === UNFILED ? null : key,
      seconds: Math.round(ms / 1000),
    });
  }
  return out;
}
