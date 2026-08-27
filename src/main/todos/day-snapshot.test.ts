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
  project_id: null,
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
      projectTitles: new Map(),
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
      projectTitles: new Map(),
    });
    expect(snapshot.todos).toEqual([
      {
        id: "t1",
        title: "A",
        done: true,
        completedOn: "2026-08-24",
        workedSec: 1500,
        projectId: null,
      },
      {
        id: "t2",
        title: "B",
        done: false,
        completedOn: null,
        workedSec: 0,
        projectId: null,
      },
    ]);
  });

  it("orders todos by title then id, deterministically", () => {
    const snapshot = buildDaySnapshot({
      day: "2026-08-24",
      entries: [],
      todos: [todo("t2", "B"), todo("t3", "A"), todo("t1", "B")],
      workedSecByTodo: new Map(),
      projectTitles: new Map(),
    });
    expect(snapshot.todos.map((t) => t.id)).toEqual(["t3", "t1", "t2"]);
  });

  it("denormalizes titles into the snapshot and stamps the version", () => {
    const snapshot = buildDaySnapshot({
      day: "2026-08-24",
      entries: [entry("e1", "10:00", "12:00")],
      todos: [todo("t1", "Survives deletion")],
      workedSecByTodo: new Map(),
      projectTitles: new Map(),
    });
    expect(snapshot.v).toBe(2);
    expect(snapshot.day).toBe("2026-08-24");
    expect(snapshot.todos[0].title).toBe("Survives deletion");
  });

  it("rolls up only the projects the day actually moved", () => {
    const snapshot = buildDaySnapshot({
      day: "2026-08-24",
      entries: [],
      todos: [
        // Worked on: counts, no completion.
        todo("t1", "A", { project_id: "p1" }),
        // Completed on the day: counts, no time.
        todo("t2", "B", { project_id: "p1", done: 1, completed_on: "2026-08-24" }),
        // Merely dated on the day: not movement.
        todo("t3", "C", { project_id: "p2" }),
        // Movement, but unfiled.
        todo("t4", "D", { done: 1, completed_on: "2026-08-24" }),
      ],
      workedSecByTodo: new Map([["t1", 1500]]),
      projectTitles: new Map([
        ["p1", "Ship it"],
        ["p2", "Idle"],
      ]),
    });
    expect(snapshot.projects).toEqual([
      { id: "p1", title: "Ship it", workedSec: 1500, doneCount: 1 },
    ]);
  });

  it("does not credit the day with a completion carried from another one", () => {
    const snapshot = buildDaySnapshot({
      day: "2026-08-24",
      entries: [],
      // Completed earlier, still involved because it was planned into today.
      todos: [todo("t1", "A", { project_id: "p1", done: 1, completed_on: "2026-08-23" })],
      workedSecByTodo: new Map(),
      projectTitles: new Map([["p1", "Ship it"]]),
    });
    expect(snapshot.projects).toEqual([]);
  });

  it("drops a project id it cannot name, and orders by title then id", () => {
    const snapshot = buildDaySnapshot({
      day: "2026-08-24",
      entries: [],
      todos: [
        todo("t1", "A", { project_id: "p1" }),
        todo("t2", "B", { project_id: "p2" }),
        todo("t3", "C", { project_id: "gone" }),
      ],
      workedSecByTodo: new Map([
        ["t1", 60],
        ["t2", 60],
        ["t3", 60],
      ]),
      projectTitles: new Map([
        ["p1", "Zebra"],
        ["p2", "Alpha"],
      ]),
    });
    expect(snapshot.projects.map((p) => p.id)).toEqual(["p2", "p1"]);
  });

  it("does not mutate its inputs", () => {
    const entries = [entry("e1", "23:00", "01:00"), entry("e2", "09:00", "10:00")];
    const todos = [todo("t2", "B"), todo("t1", "A")];
    buildDaySnapshot({
      day: "2026-08-24",
      entries,
      todos,
      workedSecByTodo: new Map(),
      projectTitles: new Map(),
    });
    expect(entries.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(todos.map((t) => t.id)).toEqual(["t2", "t1"]);
  });
});
