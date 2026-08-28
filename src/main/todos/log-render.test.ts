import { describe, it, expect } from "vitest";
import { referencedTodoIds, renderLogLines, type LogOp } from "./log-render";
import type { PlanEntryRow, ProjectDocRow, ProjectRow, TodoRow } from "./types";

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
  project_id: null,
  created_at: "2026-08-25 01:00:00",
  updated_at: "2026-08-25 01:00:00",
  ...over,
});

const projectRow = (over: Partial<ProjectRow> = {}): ProjectRow => ({
  id: "pr1",
  kind: "project",
  title: "Ship v1",
  outcome: null,
  status: "active",
  target_date: null,
  sort_order: 0,
  created_at: "2026-08-25 01:00:00",
  updated_at: "2026-08-25 01:00:00",
  archived_at: null,
  ...over,
});

const docRow = (over: Partial<ProjectDocRow> = {}): ProjectDocRow => ({
  id: "d1",
  project_id: "pr1",
  title: "notes",
  body: "",
  sort_order: 0,
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

  it("degrades loudly on a journaled column without bespoke grammar", () => {
    // journal.ts diffs snapshots generically, so a future todo column is
    // journaled the day it is added; the renderer must say so rather than
    // fall through to the contentless "updated" line.
    const lines = render([
      op({ op: "update", before: todoRow(), after: { ...todoRow(), priority: 2 } }),
      op({
        seq: 2,
        op: "update",
        before: todoRow({ title: "Write tets" }),
        after: { ...todoRow(), priority: 2 },
      }),
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      'changed priority of "Write tests"',
      'renamed "Write tets" to "Write tests", changed priority of it',
    ]);
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
      op({
        seq: 2,
        entity: "plan",
        entityId: "p1",
        op: "update",
        before: planRow({ day: "2026-08-26" }),
        after: planRow({ day: "2026-08-26", start: "13:00", end: "15:00" }),
      }),
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      'planned "Write tests" 10:00-12:00 on 2026-08-26',
      'retimed "Write tests" from 10:00-12:00 to 13:00-15:00 on 2026-08-26',
    ]);
  });

  it("renders an update by what differs, not by assuming a retime", () => {
    // PlanEntryPatch is retime-only today; if a day-move op ever lands in the
    // journal, the log must say the day moved instead of rendering a
    // zero-width "retimed" built from the after-snapshot.
    const lines = render([
      op({
        entity: "plan",
        entityId: "p1",
        op: "update",
        before: planRow(),
        after: planRow({ day: "2026-08-26" }),
      }),
      op({
        seq: 2,
        entity: "plan",
        entityId: "p1",
        op: "update",
        before: planRow(),
        after: planRow({ day: "2026-08-26", start: "13:00", end: "15:00" }),
      }),
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      'moved "Write tests" from 2026-08-25 to 2026-08-26',
      'retimed "Write tests" from 10:00-12:00 to 13:00-15:00, moved it from 2026-08-25 to 2026-08-26',
    ]);
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

  it("does not fuse an unplan and a deletion from different transactions", () => {
    // Same shape as a sweep — a plan delete then that todo's delete, adjacent
    // in the journal — but the stamps differ: two separate intents hours
    // apart (journal.ts reads the clock once per write context, so one
    // transaction's ops always share one `at`). Fusing would erase the
    // deliberate unplan and antedate the deletion to it.
    const lines = render([
      op({ seq: 20, entity: "plan", entityId: "p1", op: "delete", before: planRow(), after: null }),
      op({
        seq: 21,
        op: "delete",
        before: todoRow(),
        after: null,
        at: "2026-08-25T09:41:00.000Z",
      }),
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      'unplanned "Write tests" 10:00-12:00',
      'deleted "Write tests"',
    ]);
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

describe("renderLogLines: project grammar", () => {
  const projectOp = (over: Partial<LogOp> = {}): LogOp =>
    op({ entity: "project", entityId: "pr1", before: null, after: projectRow(), ...over });

  it("names the kind on create and delete", () => {
    expect(render([projectOp()])[0].text).toBe('created project "Ship v1"');
    expect(
      render([projectOp({ after: projectRow({ kind: "area", title: "Health" }) })])[0].text
    ).toBe('created area "Health"');
    expect(
      render([projectOp({ op: "delete", before: projectRow(), after: null })])[0].text
    ).toBe('deleted project "Ship v1"');
  });

  it("gives each status destination its own verb", () => {
    const flip = (status: ProjectRow["status"]): string =>
      render([
        projectOp({
          op: "update",
          before: projectRow(),
          after: projectRow({ status, archived_at: status === "archived" ? AT : null }),
        }),
      ])[0].text;
    expect(flip("archived")).toBe('archived "Ship v1"');
    expect(flip("done")).toBe('marked "Ship v1" done');
    expect(flip("someday")).toBe('moved "Ship v1" to someday');
  });

  it("does not mention archived_at alongside the status flip", () => {
    const text = render([
      projectOp({
        op: "update",
        before: projectRow({ status: "archived", archived_at: AT }),
        after: projectRow({ status: "active", archived_at: null }),
      }),
    ])[0].text;
    expect(text).toBe('reactivated "Ship v1"');
  });

  it("renders a kind change and a rename, naming the title once", () => {
    const text = render([
      projectOp({
        op: "update",
        before: projectRow(),
        after: projectRow({ title: "Health", kind: "area" }),
      }),
    ])[0].text;
    expect(text).toBe('renamed "Ship v1" to "Health", turned it into an area');
  });

  it("renders outcome and target date changes", () => {
    const text = render([
      projectOp({
        op: "update",
        before: projectRow(),
        after: projectRow({ outcome: "released", target_date: "2026-09-30" }),
      }),
    ])[0].text;
    expect(text).toBe(
      'set the outcome of "Ship v1", set the target date of it to 2026-09-30'
    );
  });

  it("falls back loudly for an unknown column", () => {
    const text = render([
      projectOp({
        op: "update",
        before: { ...projectRow(), owner: "a" } as unknown as Record<string, unknown>,
        after: { ...projectRow(), owner: "b" } as unknown as Record<string, unknown>,
      }),
    ])[0].text;
    expect(text).toBe('changed owner of "Ship v1"');
  });
});

describe("renderLogLines: project doc grammar", () => {
  const docOp = (over: Partial<LogOp> = {}): LogOp =>
    op({ entity: "project_doc", entityId: "d1", before: null, after: docRow(), ...over });

  it("renders create, delete and rename", () => {
    expect(render([docOp()])[0].text).toBe('added the doc "notes"');
    expect(render([docOp({ op: "delete", before: docRow(), after: null })])[0].text).toBe(
      'removed the doc "notes"'
    );
    expect(
      render([
        docOp({ op: "update", before: docRow(), after: docRow({ title: "decisions" }) }),
      ])[0].text
    ).toBe('renamed the doc "notes" to "decisions"');
  });

  it("never renders the body of a doc", () => {
    const text = render([
      docOp({
        op: "update",
        before: docRow(),
        after: docRow({ body: "a secret worth not printing" }),
      }),
    ])[0].text;
    expect(text).toBe('updated the doc "notes"');
  });
});

describe("renderLogLines: filing a todo", () => {
  it("renders filing and detaching without naming the project", () => {
    const filed = render([
      op({
        op: "update",
        before: todoRow(),
        after: todoRow({ project_id: "pr1" }),
      }),
    ])[0].text;
    expect(filed).toBe('filed "Write tests" into a project');

    const detached = render([
      op({
        op: "update",
        before: todoRow({ project_id: "pr1" }),
        after: todoRow(),
      }),
    ])[0].text;
    expect(detached).toBe('detached "Write tests" from its project');
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
