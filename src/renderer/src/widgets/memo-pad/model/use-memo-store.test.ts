// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// useMemoStore wraps store creation in useMemo; call the factory directly so we
// can drive the store outside React (same trick as the pomodoro store's test).
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useMemo: (fn: () => unknown) => fn() };
});

import { useMemoStore } from "./use-memo-store";

// What the pure history module cannot cover: when a keystroke joins the open
// undo step versus starting a new one, and what reaches memos.db in which
// order. The memo is only as durable as those writes.

const WRITE_DEBOUNCE_MS = 400;
const PAUSE_MS = 700; // longer than COALESCE_WINDOW_MS
const SAVED_AT = "2026-08-06T00:00:00.000Z";

type LoadedState = {
  id: string;
  body: string;
  cursor: number;
  edits: MemoEdit[];
  snapshots: MemoSnapshotItem[];
  updatedAt: string;
};

let loaded: LoadedState;
let api: {
  load: ReturnType<typeof vi.fn>;
  commitEdit: ReturnType<typeof vi.fn>;
  moveCursor: ReturnType<typeof vi.fn>;
  snapshot: {
    create: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
};

// createWidgetStore caches by instance id, so every test needs a fresh one.
let counter = 0;
async function openStore(state?: Partial<LoadedState>) {
  const id = `memo-test-${counter++}`;
  loaded = {
    id,
    body: "",
    cursor: 0,
    edits: [],
    snapshots: [],
    updatedAt: SAVED_AT,
    ...state,
  };
  // Not a real hook call: react's useMemo is mocked to an identity above.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const store = useMemoStore(id);
  await store.getState().load();
  return store;
}

function commitedEdits(): MemoCommitEditInput[] {
  return api.commitEdit.mock.calls.map((call) => call[0] as MemoCommitEditInput);
}

beforeEach(() => {
  vi.useFakeTimers();
  api = {
    load: vi.fn(async () => loaded),
    commitEdit: vi.fn(async () => ({ updatedAt: SAVED_AT })),
    moveCursor: vi.fn(async () => ({ updatedAt: SAVED_AT })),
    snapshot: {
      create: vi.fn(async (_id: string, body: string) => ({
        id: `snap-${counter}`,
        body,
        createdAt: SAVED_AT,
      })),
      list: vi.fn(async () => []),
      remove: vi.fn(async () => undefined),
    },
  };
  window.electronAPI = { memos: api } as unknown as ElectronAPI;
});

afterEach(() => {
  vi.useRealTimers();
  delete window.electronAPI;
});

describe("typing", () => {
  it("folds a burst into one undo step and one write", async () => {
    const store = await openStore();
    store.getState().edit("h");
    store.getState().edit("he");
    store.getState().edit("hel");

    expect(store.getState().history.edits).toHaveLength(1);
    expect(api.commitEdit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(WRITE_DEBOUNCE_MS);
    expect(commitedEdits()).toEqual([
      {
        id: loaded.id,
        body: "hel",
        edit: { seq: 1, start: 0, removed: "", inserted: "hel" },
      },
    ]);
  });

  it("starts a new step after a pause", async () => {
    const store = await openStore();
    store.getState().edit("one");
    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    store.getState().edit("one two");
    await vi.advanceTimersByTimeAsync(WRITE_DEBOUNCE_MS);

    expect(store.getState().history.edits.map((e) => e.seq)).toEqual([1, 2]);
    store.getState().undo();
    expect(store.getState().body).toBe("one");
  });

  it("writes the open step before starting the next one", async () => {
    const store = await openStore();
    store.getState().edit("one");
    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    // The second burst begins before the first burst's debounce fired.
    store.getState().edit("one two");
    await vi.advanceTimersByTimeAsync(WRITE_DEBOUNCE_MS);

    expect(commitedEdits().map((c) => c.edit.seq)).toEqual([1, 2]);
    expect(commitedEdits()[0].body).toBe("one");
  });

  it("keeps a paste as its own undo step", async () => {
    const store = await openStore();
    store.getState().edit("abc");
    store.getState().edit("abcXYZ", { isolate: true });

    expect(store.getState().history.edits).toHaveLength(2);
    store.getState().undo();
    expect(store.getState().body).toBe("abc");
  });
});

describe("undo and redo", () => {
  it("flushes the open step before moving the cursor", async () => {
    const store = await openStore();
    const order: string[] = [];
    api.commitEdit.mockImplementation(async () => {
      order.push("commit");
      return { updatedAt: SAVED_AT };
    });
    api.moveCursor.mockImplementation(async () => {
      order.push("move");
      return { updatedAt: SAVED_AT };
    });

    store.getState().edit("draft");
    store.getState().undo();

    expect(order).toEqual(["commit", "move"]);
    expect(store.getState().body).toBe("");
    expect(api.moveCursor.mock.calls[0][0]).toEqual({
      id: loaded.id,
      body: "",
      cursor: 0,
    });
  });

  it("does not merge a keystroke into the step it just undid", async () => {
    const store = await openStore();
    store.getState().edit("ab");
    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    store.getState().edit("abc");
    store.getState().undo();
    store.getState().edit("abZ");

    // The redo tail is gone and the new keystroke is its own step, not an
    // amendment of the one that was just walked back.
    expect(store.getState().history.edits.map((e) => e.seq)).toEqual([1, 2]);
    store.getState().undo();
    expect(store.getState().body).toBe("ab");
  });

  it("reopens a memo with its history still walkable", async () => {
    // What the widget sees after an app restart: body and edits from SQLite.
    const store = await openStore({
      body: "hello",
      cursor: 2,
      edits: [
        { seq: 1, start: 0, removed: "", inserted: "he" },
        { seq: 2, start: 2, removed: "", inserted: "llo" },
      ],
    });

    store.getState().undo();
    expect(store.getState().body).toBe("he");
    store.getState().undo();
    expect(store.getState().body).toBe("");

    store.getState().redo();
    store.getState().redo();
    expect(store.getState().body).toBe("hello");
    expect(store.getState().caret).toBe(5);
  });
});

describe("snapshots", () => {
  it("captures the current body and lists it first", async () => {
    const store = await openStore();
    store.getState().edit("keep this");
    await store.getState().saveSnapshot();

    expect(api.snapshot.create).toHaveBeenCalledWith(loaded.id, "keep this");
    expect(store.getState().snapshots.map((s) => s.body)).toEqual(["keep this"]);
    // The body write is flushed with the snapshot, not left in the debounce.
    expect(api.commitEdit).toHaveBeenCalledTimes(1);
  });

  it("restores as an ordinary edit, so the restore itself can be undone", async () => {
    const store = await openStore();
    store.getState().edit("original");
    await store.getState().saveSnapshot();
    await vi.advanceTimersByTimeAsync(PAUSE_MS);
    store.getState().edit("original, then changed");

    const [snapshot] = store.getState().snapshots;
    store.getState().restoreSnapshot(snapshot.id);
    expect(store.getState().body).toBe("original");

    store.getState().undo();
    expect(store.getState().body).toBe("original, then changed");
  });
});

describe("without the desktop bridge", () => {
  it("reports itself unavailable instead of throwing", async () => {
    delete window.electronAPI;
    const store = useMemoStore(`memo-test-${counter++}`);
    await store.getState().load();

    expect(store.getState().status).toBe("unavailable");
    expect(store.getState().error).toBeTruthy();
  });
});
