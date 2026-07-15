// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// usePomodoroStore wraps store creation in useMemo; call the factory directly so
// we can drive the store outside React.
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, useMemo: (fn: () => unknown) => fn() };
});

import { usePomodoroStore } from "./use-pomodoro-store";
import { useTodoStore, type Todo } from "@/src/entities/todo";
import type { PomodoroConfig } from "./pomodoro.types";

// The store reads only `.id` off each desk member, so minimal stand-ins suffice.
function deskOf(...ids: string[]): Todo[] {
  return ids.map((id) => ({ id }) as unknown as Todo);
}

type RecordWorkCall = {
  attributionId: string;
  todoId: string;
  sessionId: string;
  startedAt: number;
  endedAt: number;
  workedSec: number;
};

const CONFIG: PomodoroConfig = {
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  pomodorosUntilLongBreak: 4,
  leisureProcesses: [],
  detectionEnabled: true,
  chimeEnabled: true,
  flashEnabled: true,
};
const FULL_BLOCK_SEC = 25 * 60; // 1500
const T0 = 1_770_000_000_000; // fixed epoch ms
let recordWork: ReturnType<typeof vi.fn>;
let recordSessionLog: ReturnType<typeof vi.fn>;

// A unique instance id per test — createWidgetStore caches by id, so reusing one
// would bleed state across tests.
let counter = 0;
function freshStore() {
  // Not a real hook call: react's useMemo is mocked to an identity above, so this
  // just invokes the store factory.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const store = usePomodoroStore(`itest-${counter++}`, CONFIG);
  store.getState().reset();
  return store;
}

function recordWorkCalls(): RecordWorkCall[] {
  return recordWork.mock.calls.map((c) => c[0] as RecordWorkCall);
}

function sessionLogRecords(): { todoIds: string[] }[] {
  return recordSessionLog.mock.calls.map((c) => c[0] as { todoIds: string[] });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  recordWork = vi.fn().mockResolvedValue(undefined);
  recordSessionLog = vi.fn().mockResolvedValue(undefined);
  // Minimal electronAPI: the accrual write + the session-log write-through.
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    todos: { recordWork },
    pomodoro: { record: recordSessionLog },
  };
  useTodoStore.setState({ desk: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pomodoro store -> desk interval accrual (glue)", () => {
  it("start then skip banks the full block to the sole desk member", () => {
    useTodoStore.setState({ desk: deskOf("T1") });
    const store = freshStore();

    store.getState().start();
    store.getState().skip();

    const calls = recordWorkCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ todoId: "T1", workedSec: FULL_BLOCK_SEC });
    expect(calls[0].attributionId).toMatch(/:T1:0$/);
    expect(calls[0].sessionId.length).toBeGreaterThan(0);
  });

  it("empty desk -> nothing is banked", () => {
    const store = freshStore(); // desk is empty
    store.getState().start();
    store.getState().skip();
    expect(recordWorkCalls()).toHaveLength(0);
  });

  it("pause banks the elapsed wall time so far", () => {
    useTodoStore.setState({ desk: deskOf("T1") });
    const store = freshStore();

    store.getState().start();
    vi.setSystemTime(T0 + 300_000); // 5 min in
    store.getState().pause();

    const calls = recordWorkCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ todoId: "T1", workedSec: 300 });
  });

  it("swapping the desk member mid-block banks the leaver, then the joiner rides to skip", () => {
    useTodoStore.setState({ desk: deskOf("T1") });
    const store = freshStore();

    store.getState().start();
    vi.setSystemTime(T0 + 300_000); // 5 min in
    // Desk change: DeskAttributionController would call syncDesk on this.
    useTodoStore.setState({ desk: deskOf("T2") });
    store.getState().syncDesk();

    // T1 banked its 5-min partial at the switch.
    let calls = recordWorkCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ todoId: "T1", workedSec: 300 });
    expect(calls[0].attributionId).toMatch(/:T1:0$/);

    // T2 rode from the switch to skip (closes at phase end = full block start +
    // 25 min), so 25 - 5 = 20 min.
    store.getState().skip();
    calls = recordWorkCalls();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ todoId: "T2", workedSec: 20 * 60 });
    expect(calls[1].attributionId).toMatch(/:T2:0$/);
  });

  it("two todos on the desk each bank the full block (no division)", () => {
    useTodoStore.setState({ desk: deskOf("T1", "T2") });
    const store = freshStore();

    store.getState().start();
    store.getState().skip();

    const calls = recordWorkCalls();
    expect(calls).toHaveLength(2);
    const byTodo = Object.fromEntries(calls.map((c) => [c.todoId, c.workedSec]));
    // Each member independently gets the whole overlap — overlaps are not split.
    expect(byTodo).toEqual({ T1: FULL_BLOCK_SEC, T2: FULL_BLOCK_SEC });
  });

  it("the session-log record's todoIds is the desk union, including a mid-block leaver", () => {
    useTodoStore.setState({ desk: deskOf("T1", "T2") });
    const store = freshStore();

    store.getState().start();
    vi.setSystemTime(T0 + 300_000); // 5 min in
    useTodoStore.setState({ desk: deskOf("T1") }); // T2 leaves (e.g. completed)
    store.getState().syncDesk();
    store.getState().skip(); // records the session log

    // The live desk at record time is only [T1], but the record must carry both:
    // the union spans every todo that was on the desk at any point. This is the
    // phase-4 fix — a live-desk snapshot would have dropped T2.
    const records = sessionLogRecords();
    expect(records).toHaveLength(1);
    expect([...records[0].todoIds].sort()).toEqual(["T1", "T2"]);
  });

  it("a todo joining mid-block accrues from its join; existing members keep the full block", () => {
    useTodoStore.setState({ desk: deskOf("T1") });
    const store = freshStore();

    store.getState().start();
    vi.setSystemTime(T0 + 300_000); // 5 min in
    useTodoStore.setState({ desk: deskOf("T1", "T2") }); // T2 joins the desk
    store.getState().syncDesk();
    store.getState().skip();

    const calls = recordWorkCalls();
    const byTodo = Object.fromEntries(calls.map((c) => [c.todoId, c.workedSec]));
    // T1 rode the whole block; T2 only from its 5-min join to phase end.
    expect(byTodo).toEqual({ T1: FULL_BLOCK_SEC, T2: 20 * 60 });
  });

  it("early stop then confirmReview banks only the elapsed block seconds", () => {
    useTodoStore.setState({ desk: deskOf("T1") });
    const store = freshStore();

    store.getState().start();
    vi.setSystemTime(T0 + 420_000); // 7 min in
    store.getState().stop();
    // Accrual is deferred to the review (editable total); nothing banked yet.
    expect(recordWorkCalls()).toHaveLength(0);

    store.getState().confirmReview({
      attention: "focus",
      attentionSource: "auto",
      overtimeSec: 0,
    });
    const calls = recordWorkCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ todoId: "T1", workedSec: 420 });
  });

  it("pause then resume yields two distinct interval rows summing to the block", () => {
    useTodoStore.setState({ desk: deskOf("T1") });
    const store = freshStore();

    store.getState().start();
    vi.setSystemTime(T0 + 300_000); // 5 min
    store.getState().pause(); // banks T1:0 = 300s
    vi.setSystemTime(T0 + 480_000); // resume after a 3-min pause
    store.getState().start(); // resume: reopens T1 (seq 1), phase end shifts +180s
    store.getState().skip(); // banks T1:1 for the remaining 20 min

    const calls = recordWorkCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0].attributionId).toMatch(/:T1:0$/);
    expect(calls[1].attributionId).toMatch(/:T1:1$/);
    expect(calls[0].sessionId).toBe(calls[1].sessionId); // same block/session
    expect(calls[0].workedSec + calls[1].workedSec).toBe(FULL_BLOCK_SEC);
  });
});
