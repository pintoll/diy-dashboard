import { describe, it, expect } from "vitest";
import { buildDaySnapshot } from "./day-snapshot";
import type { PlanEntryRow, TodoRow } from "./types";

// Only the pure derivation is unit-tested; the queries feeding it live in
// fold.ts, which needs better-sqlite3 (Electron ABI) and is covered by the
// offline verification script instead.

const entry = (id: string, start: string, end: string, todoId = "t1"): PlanEntryRow => ({
  id,
  day: "2026-08-24",
  todo_id: todoId,
  start,
  end,
});

const todo = (id: string, title: string, over: Partial<TodoRow> = {}): TodoRow => ({
  id,
  date: "2026-08-24",
  title,
  note: null,
  done: 0,
  completed_on: null,
  sort_order: 0,
  worked_sec: 999_999,
  source: "user",
  created_at: "2026-08-24 10:00:00",
  updated_at: "2026-08-24 10:00:00",
  ...over,
});

describe("buildDaySnapshot", () => {
  it("sorts entries in lived order, insertion order on ties", () => {
    const snapshot = buildDaySnapshot({
      day: "2026-08-24",
      // Insertion order: an early-morning wrap block first, then two 10:00s.
      entries: [entry("e1", "01:00", "02:00"), entry("e2", "10:00", "12:00"), entry("e3", "10:00", "11:00")],
      todos: [],
      workedSecByTodo: new Map(),
    });
    expect(snapshot.entries.map((e) => e.start)).toEqual(["10:00", "10:00", "01:00"]);
    // The two 10:00 blocks keep their insertion order (e2 before e3).
    expect(snapshot.entries[0]).toEqual({ todoId: "t1", start: "10:00", end: "12:00" });
    expect(snapshot.entries[1]).toEqual({ todoId: "t1", start: "10:00", end: "11:00" });
  });

  it("reads outcomes from the per-day map, not the lifetime rollup", () => {
    const snapshot = buildDaySnapshot({
      day: "2026-08-24",
      entries: [],
      todos: [todo("t1", "A", { done: 1, completed_on: "2026-08-24" }), todo("t2", "B")],
      workedSecByTodo: new Map([["t1", 1500]]),
    });
    expect(snapshot.todos).toEqual([
      { id: "t1", title: "A", done: true, completedOn: "2026-08-24", workedSec: 1500 },
      { id: "t2", title: "B", done: false, completedOn: null, workedSec: 0 },
    ]);
  });

  it("orders todos by title then id, deterministically", () => {
    const snapshot = buildDaySnapshot({
      day: "2026-08-24",
      entries: [],
      todos: [todo("t2", "B"), todo("t3", "A"), todo("t1", "B")],
      workedSecByTodo: new Map(),
    });
    expect(snapshot.todos.map((t) => t.id)).toEqual(["t3", "t1", "t2"]);
  });

  it("denormalizes titles into the snapshot and stamps the version", () => {
    const snapshot = buildDaySnapshot({
      day: "2026-08-24",
      entries: [entry("e1", "10:00", "12:00")],
      todos: [todo("t1", "Survives deletion")],
      workedSecByTodo: new Map(),
    });
    expect(snapshot.v).toBe(1);
    expect(snapshot.day).toBe("2026-08-24");
    expect(snapshot.todos[0].title).toBe("Survives deletion");
  });

  it("does not mutate its inputs", () => {
    const entries = [entry("e1", "23:00", "01:00"), entry("e2", "09:00", "10:00")];
    const todos = [todo("t2", "B"), todo("t1", "A")];
    buildDaySnapshot({ day: "2026-08-24", entries, todos, workedSecByTodo: new Map() });
    expect(entries.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(todos.map((t) => t.id)).toEqual(["t2", "t1"]);
  });
});
