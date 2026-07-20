// Geometry and order bookkeeping for the pointer-driven reorder in
// `use-drag-reorder`. Kept free of DOM and React so the fiddly parts can be
// reasoned about (and later tested) on their own.

// A row's position at drag start: `top` relative to the list wrapper, so the
// value is independent of scrolling and of which ancestor happens to be the
// offset parent.
export type RowRect = { top: number; height: number };

// The flex gap between rows, read off the measurements rather than hardcoded to
// whatever `gap-*` class the callers use.
export function measureGap(rects: readonly RowRect[]): number {
  if (rects.length < 2) return 0;
  return rects[1].top - (rects[0].top + rects[0].height);
}

// Whose slot the dragged row should take, given the center it is currently
// drawn at. The answer is an index into the pre-drag order, which is what
// `moveItem` and `rowOffset` both expect.
//
// The comparison is against the rows' *pre-drag* centers, which are frozen for
// the whole gesture. Two properties follow, and both matter:
//
//   - Thresholds never move, so the result cannot oscillate. Comparing against
//     rows' live (shifted) positions instead would flip back and forth as soon
//     as two adjacent rows differ in height, which is routine here: a row grows
//     a second line once it has worked time.
//   - At zero displacement the nearest center is the row's own, so picking a
//     row up never moves anything. Formulations that compare against the
//     collapsed rest layout fail exactly this, because a shorter neighbour's
//     center lands above the dragged row's before it has moved at all.
//
// The switch point between two rows is the midpoint between their centers, so
// a row travels about half its own height before displacing the next one.
export function insertionIndex(
  rects: readonly RowRect[],
  center: number
): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < rects.length; index++) {
    const distance = Math.abs(rects[index].top + rects[index].height / 2 - center);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

// How far a row must be translated to open the gap at `to`. The dragged row is
// driven by the pointer instead, so it stays at 0 here.
export function rowOffset(
  index: number,
  from: number,
  to: number,
  unit: number
): number {
  if (index === from) return 0;
  if (index > from && index <= to) return -unit;
  if (index < from && index >= to) return unit;
  return 0;
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice();
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

// Pixels to scroll this frame. Ramps up over the edge zone and clamps, so
// holding the pointer far outside the container does not run away.
export function autoScrollSpeed(
  pointerY: number,
  top: number,
  bottom: number,
  edge: number,
  max: number
): number {
  // Too short to hold two zones: they would overlap and the top would always
  // win. The widget can be resized down to about this.
  if (bottom - top < edge * 2) return 0;

  if (pointerY < top + edge) {
    return -Math.ceil(Math.min(1, (top + edge - pointerY) / edge) * max);
  }
  if (pointerY > bottom - edge) {
    return Math.ceil(Math.min(1, (pointerY - (bottom - edge)) / edge) * max);
  }
  return 0;
}

// Reorders `todos` to match `ids`. Todos missing from `ids` (added by another
// window or the agent API mid-drag) keep their relative order at the end.
export function applyOrder<T extends { id: string }>(
  todos: readonly T[],
  ids: readonly string[]
): T[] {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return [...todos].sort(
    (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity)
  );
}

// Whether the database has caught up with a locally applied order, so the local
// copy can be dropped.
//
// Only the ids present on both sides are compared. Requiring equal length would
// never be satisfied if a todo were added or deleted between the write and the
// refresh, and the stale local order would then mask every later reorder made
// from the other surface or the agent API.
export function orderSettled(
  todoIds: readonly string[],
  pending: readonly string[]
): boolean {
  const present = new Set(todoIds);
  const known = new Set(pending);
  const expected = pending.filter((id) => present.has(id));
  const actual = todoIds.filter((id) => known.has(id));
  return (
    expected.length === actual.length &&
    expected.every((id, index) => id === actual[index])
  );
}
