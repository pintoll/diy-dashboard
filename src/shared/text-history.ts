// A DOM-free undo/redo model for a single text buffer. Shared by the memo
// widget (which edits) and main (which stores and prunes), because both sides
// must agree on MAX_UNDO — main pruning one step earlier than the widget
// expects would silently swallow an undo the UI still offers.
//
// History is a list of *splices*, not full-text snapshots. A splice reads "at
// `start`, `removed` became `inserted`", and its inverse is the same record
// with the two swapped — which is all undo needs. One typing burst is a few
// bytes, so 100 steps back plus 100 forward survive a restart without the
// stored payload growing with the document.
//
// `cursor` is the seq of the last edit that has been applied to the body.
// Entries at or below it are undoable; entries above it are the redo tail.
// Committing a new edit discards that tail, so history stays linear.

export type Splice = {
  start: number;
  removed: string;
  inserted: string;
};

export type TextEdit = Splice & { seq: number };

export type History = {
  edits: TextEdit[];
  cursor: number;
};

export type HistoryStep = {
  history: History;
  // Apply to the current body to reach the stepped-to state.
  splice: Splice;
  // Where the caret belongs once that splice has been applied.
  caret: number;
};

// 100 steps back. After 100 undos the same 100 entries sit ahead of the cursor,
// which is the 100 steps forward.
export const MAX_UNDO = 100;

// Consecutive edits closer together than this fold into one undo step.
export const COALESCE_WINDOW_MS = 600;

// Ceiling on a coalesced group, so a held-down key (or a fast paste-like burst)
// cannot grow one undo step into the whole document.
const MAX_GROUP_CHARS = 120;

export function emptyHistory(): History {
  return { edits: [], cursor: 0 };
}

// Reduces a whole-buffer before/after pair to the single splice between them by
// dropping the common prefix and suffix. Returns null when nothing changed.
export function diffSplice(prev: string, next: string): Splice | null {
  if (prev === next) return null;

  const shortest = Math.min(prev.length, next.length);
  let start = 0;
  while (start < shortest && prev[start] === next[start]) start++;

  let prevEnd = prev.length;
  let nextEnd = next.length;
  while (
    prevEnd > start &&
    nextEnd > start &&
    prev[prevEnd - 1] === next[nextEnd - 1]
  ) {
    prevEnd--;
    nextEnd--;
  }

  return {
    start,
    removed: prev.slice(start, prevEnd),
    inserted: next.slice(start, nextEnd),
  };
}

export function applySplice(text: string, splice: Splice): string {
  return (
    text.slice(0, splice.start) +
    splice.inserted +
    text.slice(splice.start + splice.removed.length)
  );
}

export function invertSplice(splice: Splice): Splice {
  return {
    start: splice.start,
    removed: splice.inserted,
    inserted: splice.removed,
  };
}

function withinGroupCap(splice: Splice): Splice | null {
  return splice.inserted.length > MAX_GROUP_CHARS ||
    splice.removed.length > MAX_GROUP_CHARS
    ? null
    : splice;
}

/**
 * Folds `incoming` into the still-open `pending` step, or returns null when the
 * two do not belong in one undo. Time is the caller's business (see
 * COALESCE_WINDOW_MS); this decides purely on shape.
 */
export function mergeSplice(pending: Splice, incoming: Splice): Splice | null {
  // A newline is a natural boundary: undo should stop at the end of a line
  // rather than swallowing the line before it.
  if (incoming.inserted.includes("\n")) return null;

  // Case 1: `incoming` lands inside the text `pending` inserted. Covers typing
  // on at the caret, an IME rewriting the syllable it just composed, and
  // backspacing back through the run just typed.
  const relStart = incoming.start - pending.start;
  const relEnd = relStart + incoming.removed.length;
  if (relStart >= 0 && relEnd <= pending.inserted.length) {
    return withinGroupCap({
      start: pending.start,
      removed: pending.removed,
      inserted:
        pending.inserted.slice(0, relStart) +
        incoming.inserted +
        pending.inserted.slice(relEnd),
    });
  }

  // Case 2: a deletion growing outward from a deletion — a held backspace or
  // delete key, which should undo as one step.
  if (pending.inserted === "" && incoming.inserted === "") {
    if (incoming.start + incoming.removed.length === pending.start) {
      return withinGroupCap({
        start: incoming.start,
        removed: incoming.removed + pending.removed,
        inserted: "",
      });
    }
    if (incoming.start === pending.start) {
      return withinGroupCap({
        start: pending.start,
        removed: pending.removed + incoming.removed,
        inserted: "",
      });
    }
  }

  return null;
}

function prune(edits: TextEdit[], cursor: number): TextEdit[] {
  const floor = cursor - MAX_UNDO;
  return floor > 0 ? edits.filter((edit) => edit.seq > floor) : edits;
}

/**
 * Commits `splice` as a new step. The redo tail is dropped, so the seq it takes
 * is always `cursor + 1` — main relies on that when it upserts the row.
 */
export function pushEdit(
  history: History,
  splice: Splice
): { history: History; edit: TextEdit } {
  const edit: TextEdit = { seq: history.cursor + 1, ...splice };
  const kept = history.edits.filter((e) => e.seq <= history.cursor);
  return {
    history: { edits: prune([...kept, edit], edit.seq), cursor: edit.seq },
    edit,
  };
}

/**
 * Grows the step at the cursor instead of adding one, when the shapes allow it.
 * Returns null when they do not, and the caller should `pushEdit` instead.
 */
export function amendEdit(
  history: History,
  splice: Splice
): { history: History; edit: TextEdit } | null {
  const open = history.edits.find((e) => e.seq === history.cursor);
  if (!open) return null;

  const merged = mergeSplice(open, splice);
  if (!merged) return null;

  const edit: TextEdit = { seq: open.seq, ...merged };
  return {
    history: {
      cursor: history.cursor,
      edits: history.edits.map((e) => (e.seq === edit.seq ? edit : e)),
    },
    edit,
  };
}

export function canUndo(history: History): boolean {
  return history.edits.some((e) => e.seq === history.cursor);
}

export function canRedo(history: History): boolean {
  return history.edits.some((e) => e.seq === history.cursor + 1);
}

export function undoDepth(history: History): number {
  return history.edits.filter((e) => e.seq <= history.cursor).length;
}

export function redoDepth(history: History): number {
  return history.edits.filter((e) => e.seq > history.cursor).length;
}

export function undo(history: History): HistoryStep | null {
  const edit = history.edits.find((e) => e.seq === history.cursor);
  if (!edit) return null;
  return {
    history: { edits: history.edits, cursor: history.cursor - 1 },
    splice: invertSplice(edit),
    // The caret lands where the restored text ends.
    caret: edit.start + edit.removed.length,
  };
}

export function redo(history: History): HistoryStep | null {
  const edit = history.edits.find((e) => e.seq === history.cursor + 1);
  if (!edit) return null;
  return {
    history: { edits: history.edits, cursor: edit.seq },
    splice: edit,
    caret: edit.start + edit.inserted.length,
  };
}
