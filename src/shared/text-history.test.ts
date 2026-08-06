import { describe, it, expect } from "vitest";
import {
  MAX_UNDO,
  amendEdit,
  applySplice,
  canRedo,
  canUndo,
  diffSplice,
  emptyHistory,
  invertSplice,
  mergeSplice,
  pushEdit,
  redo,
  redoDepth,
  undo,
  undoDepth,
  type History,
  type Splice,
} from "./text-history";

// The memo widget stores its undo history as splices so 100 steps back and 100
// forward can be persisted per memo. These tests pin the two properties that
// makes safe: a splice round-trips the exact buffer, and the retained window is
// bounded no matter how long the typing session ran.

function splice(prev: string, next: string): Splice {
  const result = diffSplice(prev, next);
  if (!result) throw new Error(`no change between "${prev}" and "${next}"`);
  return result;
}

// Commits `next` as its own step, the way the widget does after a pause.
function commit(state: { history: History; body: string }, next: string) {
  const { history } = pushEdit(state.history, splice(state.body, next));
  return { history, body: next };
}

describe("diffSplice", () => {
  it("reduces an append to the inserted tail alone", () => {
    expect(diffSplice("hello", "hello world")).toEqual({
      start: 5,
      removed: "",
      inserted: " world",
    });
  });

  it("reduces a deletion to the removed run alone", () => {
    expect(diffSplice("hello world", "hello")).toEqual({
      start: 5,
      removed: " world",
      inserted: "",
    });
  });

  it("strips the common prefix and suffix around a replacement", () => {
    expect(diffSplice("the quick fox", "the slow fox")).toEqual({
      start: 4,
      removed: "quick",
      inserted: "slow",
    });
  });

  it("returns null when nothing changed", () => {
    expect(diffSplice("same", "same")).toBeNull();
  });

  it("round-trips through apply and invert", () => {
    const before = "The desk holds two todos.";
    const after = "The desk holds three todos, plus one parked.";
    const forward = splice(before, after);

    expect(applySplice(before, forward)).toBe(after);
    expect(applySplice(after, invertSplice(forward))).toBe(before);
  });
});

describe("mergeSplice", () => {
  it("folds continued typing into the open step", () => {
    // "he" typed, then "l" at the caret.
    expect(
      mergeSplice(
        { start: 0, removed: "", inserted: "he" },
        { start: 2, removed: "", inserted: "l" }
      )
    ).toEqual({ start: 0, removed: "", inserted: "hel" });
  });

  it("folds an IME rewriting the syllable it just composed", () => {
    // Hangul composition replaces the last character in place.
    expect(
      mergeSplice(
        { start: 0, removed: "", inserted: "ㅎ" },
        { start: 0, removed: "ㅎ", inserted: "하" }
      )
    ).toEqual({ start: 0, removed: "", inserted: "하" });
  });

  it("folds a backspace back through the run just typed", () => {
    expect(
      mergeSplice(
        { start: 3, removed: "", inserted: "abc" },
        { start: 5, removed: "c", inserted: "" }
      )
    ).toEqual({ start: 3, removed: "", inserted: "ab" });
  });

  it("folds a held backspace growing leftward", () => {
    expect(
      mergeSplice(
        { start: 5, removed: "d", inserted: "" },
        { start: 4, removed: "c", inserted: "" }
      )
    ).toEqual({ start: 4, removed: "cd", inserted: "" });
  });

  it("folds a held delete growing rightward", () => {
    expect(
      mergeSplice(
        { start: 4, removed: "c", inserted: "" },
        { start: 4, removed: "d", inserted: "" }
      )
    ).toEqual({ start: 4, removed: "cd", inserted: "" });
  });

  it("breaks the group on a newline", () => {
    expect(
      mergeSplice(
        { start: 0, removed: "", inserted: "line" },
        { start: 4, removed: "", inserted: "\n" }
      )
    ).toBeNull();
  });

  it("breaks the group when the edit lands somewhere else", () => {
    expect(
      mergeSplice(
        { start: 10, removed: "", inserted: "abc" },
        { start: 0, removed: "", inserted: "z" }
      )
    ).toBeNull();
  });

  it("breaks the group once it would outgrow the step cap", () => {
    expect(
      mergeSplice(
        { start: 0, removed: "", inserted: "x".repeat(120) },
        { start: 120, removed: "", inserted: "y" }
      )
    ).toBeNull();
  });
});

describe("pushEdit / amendEdit", () => {
  it("numbers each step one past the cursor", () => {
    let state = { history: emptyHistory(), body: "" };
    state = commit(state, "a");
    state = commit(state, "ab");

    expect(state.history.cursor).toBe(2);
    expect(state.history.edits.map((e) => e.seq)).toEqual([1, 2]);
  });

  it("grows the step at the cursor instead of adding one", () => {
    let state = { history: emptyHistory(), body: "" };
    state = commit(state, "he");

    const amended = amendEdit(state.history, splice("he", "hel"));
    expect(amended).not.toBeNull();
    expect(amended?.history.edits).toHaveLength(1);
    expect(amended?.edit).toEqual({
      seq: 1,
      start: 0,
      removed: "",
      inserted: "hel",
    });
  });

  it("refuses to amend when the shapes do not belong together", () => {
    let state = { history: emptyHistory(), body: "" };
    state = commit(state, "hello");
    expect(amendEdit(state.history, splice("hello", "hello\n"))).toBeNull();
  });

  it("discards the redo tail when a new step lands on top of it", () => {
    let state = { history: emptyHistory(), body: "" };
    state = commit(state, "a");
    state = commit(state, "ab");

    const back = undo(state.history)!;
    expect(redoDepth(back.history)).toBe(1);

    const { history } = pushEdit(back.history, splice("a", "aZ"));
    expect(redoDepth(history)).toBe(0);
    expect(history.edits.map((e) => e.seq)).toEqual([1, 2]);
    expect(history.edits[1].inserted).toBe("Z");
  });
});

describe("undo / redo", () => {
  it("walks back to the original buffer and forward again", () => {
    let state = { history: emptyHistory(), body: "" };
    state = commit(state, "note");
    state = commit(state, "note taken");

    const first = undo(state.history)!;
    const bodyAfterUndo = applySplice(state.body, first.splice);
    expect(bodyAfterUndo).toBe("note");
    expect(first.caret).toBe(4);

    const second = undo(first.history)!;
    expect(applySplice(bodyAfterUndo, second.splice)).toBe("");
    expect(canUndo(second.history)).toBe(false);

    const forward = redo(second.history)!;
    expect(applySplice("", forward.splice)).toBe("note");
    expect(forward.caret).toBe(4);
  });

  it("returns null at either end of the history", () => {
    const empty = emptyHistory();
    expect(undo(empty)).toBeNull();
    expect(redo(empty)).toBeNull();
    expect(canUndo(empty)).toBe(false);
    expect(canRedo(empty)).toBe(false);
  });

  it("puts the caret at the end of the text a redo re-inserts", () => {
    let state = { history: emptyHistory(), body: "abc" };
    state = commit(state, "abcdef");

    const back = undo(state.history)!;
    expect(back.caret).toBe(3);

    const forward = redo(back.history)!;
    expect(forward.caret).toBe(6);
  });
});

describe("retention window", () => {
  it("keeps exactly MAX_UNDO steps behind the cursor", () => {
    let state = { history: emptyHistory(), body: "" };
    for (let i = 0; i < MAX_UNDO + 50; i++) {
      state = commit(state, state.body + "x");
    }

    expect(state.history.cursor).toBe(MAX_UNDO + 50);
    expect(state.history.edits).toHaveLength(MAX_UNDO);
    expect(undoDepth(state.history)).toBe(MAX_UNDO);
  });

  it("leaves MAX_UNDO steps forward after undoing all the way back", () => {
    let state = { history: emptyHistory(), body: "" };
    for (let i = 0; i < MAX_UNDO + 50; i++) {
      state = commit(state, state.body + "x");
    }

    let history = state.history;
    let body = state.body;
    let steps = 0;
    for (let step = undo(history); step; step = undo(history)) {
      history = step.history;
      body = applySplice(body, step.splice);
      steps++;
    }

    expect(steps).toBe(MAX_UNDO);
    expect(redoDepth(history)).toBe(MAX_UNDO);
    // 150 characters typed, 100 undone.
    expect(body).toBe("x".repeat(50));
  });
});
