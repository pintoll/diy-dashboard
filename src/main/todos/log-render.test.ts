import { describe, it, expect } from "vitest";
import { referencedTodoIds, renderLogLines, type LogOp } from "./log-render";
import type { PlanEntryRow, TodoRow } from "./types";

// Only the pure rendering is unit-tested; the queries feeding it live in
// log.ts, which needs better-sqlite3 (Electron ABI) and is covered by the
// offline verification script instead.

const DAY = "2026-08-25";
// 2026-08-25T02:03:00Z = 11:03 KST on the 05:00 day 2026-08-25.
const AT = "2026-08-25T02:03:00.000Z";

const todoRow = (over: Partial<TodoRow> = {}): TodoRow => ({
  id: "t1",
  date: DAY,
  title: "Write tests",
  note: null,
  done: 0,
  completed_on: null,
  sort_order: 0,
  worked_sec: 0,
  source: "user",
  created_at: "2026-08-25 01:00:00",
  updated_at: "2026-08-25 01:00:00",
  ...over,
});

const planRow = (over: Partial<PlanEntryRow> = {}): PlanEntryRow => ({
  id: "p1",
  day: DAY,
  todo_id: "t1",
  start: "10:00",
  end: "12:00",
  ...over,
});

const op = (over: Partial<LogOp> = {}): LogOp => ({
  seq: 1,
  entity: "todo",
  entityId: "t1",
  op: "create",
  before: null,
  after: todoRow(),
  source: "user",
  reasonId: null,
  reasonText: null,
  at: AT,
  ...over,
});

const render = (
  ops: LogOp[],
  titles: [string, string][] = [["t1", "Write tests"]]
): ReturnType<typeof renderLogLines> =>
  renderLogLines({ day: DAY, ops, titlesByTodoId: new Map(titles) });

describe("renderLogLines: todo grammar", () => {
  it("renders a create with no date suffix when the date matches the log day", () => {
    const lines = render([op()]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('added "Write tests"');
    expect(lines[0].source).toBe("user");
    expect(lines[0].reason).toBeUndefined();
  });

  it("names the destination on creates for another day and for the backlog", () => {
    const lines = render([
      op({ after: todoRow({ date: "2026-08-27" }) }),
      op({ seq: 2, after: todoRow({ date: null }) }),
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      'added "Write tests" for 2026-08-27',
      'added "Write tests" to the backlog',
    ]);
  });

  it("renders single-field updates naturally", () => {
    const update = (before: TodoRow, after: TodoRow): LogOp =>
      op({ op: "update", before, after });
    const cases: [LogOp, string][] = [
      [
        update(todoRow(), todoRow({ done: 1, completed_on: DAY })),
        'completed "Write tests"',
      ],
      [
        update(todoRow({ done: 1, completed_on: DAY }), todoRow()),
        'reopened "Write tests"',
      ],
      [
        update(todoRow({ title: "Write tets" }), todoRow()),
        'renamed "Write tets" to "Write tests"',
      ],
      [
        update(todoRow({ date: null }), todoRow()),
        'moved "Write tests" from the backlog to 2026-08-25',
      ],
      [
        update(todoRow(), todoRow({ date: null })),
        'moved "Write tests" from 2026-08-25 to the backlog',
      ],
      [
        update(todoRow(), todoRow({ note: "read ch. 3 first" })),
        'updated the note on "Write tests"',
      ],
      [
        update(todoRow({ note: "read ch. 3 first" }), todoRow()),
        'cleared the note on "Write tests"',
      ],
    ];
    for (const [input, expected] of cases) {
      expect(render([input])[0].text).toBe(expected);
    }
  });

  it("joins multiple changed fields, quoting the title once then 'it'", () => {
    const lines = render([
      op({
        op: "update",
        before: todoRow({ title: "Write tets" }),
        after: todoRow({ date: "2026-08-26" }),
      }),
      op({
        seq: 2,
        op: "update",
        before: todoRow(),
        after: todoRow({ done: 1, note: "shipped" }),
      }),
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      'renamed "Write tets" to "Write tests", moved it from 2026-08-25 to 2026-08-26',
      'completed "Write tests", updated the note on it',
    ]);
  });

  it("suppresses derived and cosmetic fields", () => {
    // completed_on rides the done flip (asserted above); a change in nothing
    // renderable still yields a line, never an empty one.
    const lines = render([
      op({ op: "update", before: todoRow(), after: todoRow({ sort_order: 5 }) }),
    ]);
    expect(lines[0].text).toBe('updated "Write tests"');
  });
});

describe("renderLogLines: plan grammar", () => {
  it("renders create/retime/delete with resolved titles", () => {
    const lines = render([
      op({ entity: "plan", entityId: "p1", before: null, after: planRow() }),
      op({
        seq: 2,
        entity: "plan",
        entityId: "p1",
        op: "update",
        before: planRow(),
        after: planRow({ start: "13:00", end: "15:00" }),
      }),
      op({
        seq: 3,
        entity: "plan",
        entityId: "p1",
        op: "delete",
        before: planRow({ start: "13:00", end: "15:00" }),
        after: null,
      }),
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      'planned "Write tests" 10:00-12:00',
      'retimed "Write tests" from 10:00-12:00 to 13:00-15:00',
      'unplanned "Write tests" 13:00-15:00',
    ]);
  });

  it("falls back to (unknown todo) when no title resolves", () => {
    const lines = render(
      [op({ entity: "plan", entityId: "p1", before: null, after: planRow() })],
      []
    );
    expect(lines[0].text).toBe("planned (unknown todo) 10:00-12:00");
  });

  it("names the plan entry's day when it differs from the log day", () => {
    const lines = render([
      op({
        entity: "plan",
        entityId: "p1",
        before: null,
        after: planRow({ day: "2026-08-26" }),
      }),
    ]);
    expect(lines[0].text).toBe('planned "Write tests" 10:00-12:00 on 2026-08-26');
  });
});

describe("renderLogLines: grouping", () => {
  const reasoned = (over: Partial<LogOp>): LogOp =>
    op({
      source: "agent",
      reasonId: "r1",
      reasonText: "Front-load the migration work",
      ...over,
    });

  it("collapses consecutive same-reason ops into one line", () => {
    const lines = render(
      [
        reasoned({ seq: 10, entityId: "t2", after: todoRow({ id: "t2", title: "Write migration" }) }),
        reasoned({
          seq: 11,
          entity: "plan",
          entityId: "p2",
          after: planRow({ id: "p2", todo_id: "t2", start: "13:00", end: "15:00" }),
        }),
      ],
      [["t2", "Write migration"]]
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      seq: 10,
      at: AT,
      time: "11:03",
      source: "agent",
      reason: "Front-load the migration work",
      text: 'Front-load the migration work: added "Write migration", planned "Write migration" 13:00-15:00',
    });
  });

  it("does not merge a reappearing reason id across a gap", () => {
    const lines = render([
      reasoned({ seq: 1 }),
      op({ seq: 2, after: todoRow({ id: "t3", title: "Other" }), entityId: "t3" }),
      reasoned({ seq: 3, after: todoRow({ id: "t4", title: "Late add" }), entityId: "t4" }),
    ]);
    expect(lines).toHaveLength(3);
    expect(lines[0].reason).toBe("Front-load the migration work");
    expect(lines[2].reason).toBe("Front-load the migration work");
  });

  it("collapses a user delete sweep into the todo-delete line", () => {
    const lines = render([
      op({ seq: 20, entity: "plan", entityId: "p1", op: "delete", before: planRow(), after: null }),
      op({
        seq: 21,
        entity: "plan",
        entityId: "p2",
        op: "delete",
        before: planRow({ id: "p2", start: "16:00", end: "17:00" }),
        after: null,
      }),
      op({ seq: 22, op: "delete", before: todoRow(), after: null }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('deleted "Write tests" (2 planned blocks removed)');
    // The anchor is the group's first op: state before the sweep began.
    expect(lines[0].seq).toBe(20);
  });

  it("uses the singular for a one-block sweep", () => {
    const lines = render([
      op({ seq: 20, entity: "plan", entityId: "p1", op: "delete", before: planRow(), after: null }),
      op({ seq: 21, op: "delete", before: todoRow(), after: null }),
    ]);
    expect(lines[0].text).toBe('deleted "Write tests" (1 planned block removed)');
  });

  it("leaves a broken sweep uncollapsed", () => {
    // An op from another source between sweep and delete splits the segment.
    const interleaved = render([
      op({ seq: 1, entity: "plan", entityId: "p1", op: "delete", before: planRow(), after: null }),
      op({ seq: 2, source: "agent", entityId: "t9", after: todoRow({ id: "t9", title: "Intruder" }) }),
      op({ seq: 3, op: "delete", before: todoRow(), after: null }),
    ]);
    expect(interleaved.map((l) => l.text)).toEqual([
      'unplanned "Write tests" 10:00-12:00',
      'added "Intruder"',
      'deleted "Write tests"',
    ]);

    // A todo_id mismatch never fuses.
    const mismatch = render([
      op({
        seq: 1,
        entity: "plan",
        entityId: "p1",
        op: "delete",
        before: planRow({ todo_id: "t2" }),
        after: null,
      }),
      op({ seq: 2, op: "delete", before: todoRow(), after: null }),
    ]);
    expect(mismatch.map((l) => l.text)).toEqual([
      "unplanned (unknown todo) 10:00-12:00",
      'deleted "Write tests"',
    ]);
  });

  it("applies the sweep collapse inside a reasoned group's summary", () => {
    const lines = render([
      reasoned({
        seq: 1,
        entity: "plan",
        entityId: "p1",
        op: "delete",
        before: planRow(),
        after: null,
      }),
      reasoned({ seq: 2, op: "delete", before: todoRow(), after: null }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe(
      'Front-load the migration work: deleted "Write tests" (1 planned block removed)'
    );
  });
});

describe("renderLogLines: line envelope", () => {
  it("formats time as Seoul wall clock and passes at through as raw ISO", () => {
    const line = render([op()])[0];
    expect(line.time).toBe("11:03");
    expect(line.at).toBe(AT);
  });

  it("returns no lines for no ops", () => {
    expect(render([])).toEqual([]);
  });
});

describe("referencedTodoIds", () => {
  it("collects todo ids from plan-op snapshots only", () => {
    const ids = referencedTodoIds([
      op(),
      op({ entity: "plan", entityId: "p1", before: null, after: planRow({ todo_id: "t5" }) }),
      op({ entity: "plan", entityId: "p2", op: "delete", before: planRow({ todo_id: "t6" }), after: null }),
    ]);
    expect(ids).toEqual(new Set(["t5", "t6"]));
  });
});
