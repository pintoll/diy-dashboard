import { describe, expect, it } from "vitest";
import { MAX_OPS, parseApply } from "./apply-ops";
import { ValidationError } from "./types";

// Only the pure parser is unit-tested; the executor (apply.ts) needs
// better-sqlite3, which cannot load under vitest (Electron ABI) and is
// covered by the offline verification script instead.

const base = { reason: "split C into C-1 and C-2" };

describe("parseApply top level", () => {
  it("parses a full batch and trims reason/sessionId", () => {
    const parsed = parseApply({
      reason: "  plan the morning  ",
      sessionId: " s-1 ",
      ops: [{ op: "todo.create", title: "A" }],
    });
    expect(parsed.reason).toBe("plan the morning");
    expect(parsed.sessionId).toBe("s-1");
    expect(parsed.ops).toHaveLength(1);
  });

  it("treats a null sessionId as absent", () => {
    const parsed = parseApply({
      ...base,
      sessionId: null,
      ops: [{ op: "todo.create", title: "A" }],
    });
    expect(parsed.sessionId).toBeUndefined();
  });

  it.each([
    [{ ops: [{ op: "todo.create", title: "A" }] }, /reason/],
    [{ reason: "  ", ops: [{ op: "todo.create", title: "A" }] }, /reason/],
    [{ ...base, sessionId: 7, ops: [{ op: "todo.create", title: "A" }] }, /sessionId/],
    [{ ...base }, /ops/],
    [{ ...base, ops: [] }, /ops/],
    [{ ...base, ops: [{ op: "todo.create", title: "A" }], extra: 1 }, /unknown key/],
    ["not an object", /body/],
  ])("rejects %j", (body, message) => {
    expect(() => parseApply(body)).toThrowError(message);
    expect(() => parseApply(body)).toThrowError(ValidationError);
  });

  it("accepts exactly MAX_OPS ops and rejects one more", () => {
    const op = { op: "todo.create", title: "A" };
    expect(parseApply({ ...base, ops: Array(MAX_OPS).fill(op) }).ops).toHaveLength(
      MAX_OPS
    );
    expect(() =>
      parseApply({ ...base, ops: Array(MAX_OPS + 1).fill(op) })
    ).toThrowError(/at most/);
  });
});

describe("op shapes", () => {
  const parseOps = (...ops: unknown[]) => parseApply({ ...base, ops }).ops;

  it("keeps only the present keys of a create input", () => {
    const [op] = parseOps({ op: "todo.create", title: "A", date: null });
    expect(op).toEqual({ kind: "todo.create", input: { title: "A", date: null } });
  });

  it("parses each kind", () => {
    const ops = parseOps(
      { op: "todo.create", title: "A" },
      { op: "todo.update", id: "t1", done: true },
      { op: "todo.delete", id: "t2" },
      { op: "plan.create", todoId: "t3", start: "10:00", end: "12:00" },
      { op: "plan.update", id: "p1", start: "11:00" },
      { op: "plan.delete", id: "p2" },
      { op: "project.create", title: "P" },
      { op: "project.update", id: "pr1", status: "archived" },
      { op: "project.delete", id: "pr2" },
      { op: "project_doc.create", projectId: "pr3", title: "decisions" },
      { op: "project_doc.update", id: "d1", append: "2026-08-28: wired it" },
      { op: "project_doc.delete", id: "d2" }
    );
    expect(ops.map((op) => op.kind)).toEqual([
      "todo.create",
      "todo.update",
      "todo.delete",
      "plan.create",
      "plan.update",
      "plan.delete",
      "project.create",
      "project.update",
      "project.delete",
      "project_doc.create",
      "project_doc.update",
      "project_doc.delete",
    ]);
  });

  // projectId is the ref, not part of the doc's create body: PROJECT_DOC_CREATE_KEYS
  // does not carry it, so it must not survive into the input the executor passes on.
  it("keeps a doc create's projectId out of its input", () => {
    const [op] = parseOps({
      op: "project_doc.create",
      projectId: "pr1",
      title: "decisions",
      body: "why sqlite",
    });
    expect(op).toEqual({
      kind: "project_doc.create",
      projectRef: { kind: "id", id: "pr1" },
      input: { title: "decisions", body: "why sqlite" },
    });
  });

  // body/append exclusivity belongs to resolveDocBodyPatch inside the batch
  // transaction; the parser must let the pair through rather than fork the rule.
  it("passes a doc patch carrying both body and append to the executor", () => {
    const [op] = parseOps({ op: "project_doc.update", id: "d1", body: "x", append: "y" });
    expect(op).toMatchObject({ patch: { body: "x", append: "y" } });
  });

  it.each([
    [{ op: "todo.make", title: "A" }, /unknown op/],
    [{ op: "todo.create", title: "A", day: "2026-08-26" }, /unknown key/],
    [{ op: "todo.update", id: "t1" }, /at least one/],
    [{ op: "plan.update", id: "p1" }, /at least one/],
    [{ op: "plan.create", todoId: "t1", start: "10:00", end: "11:00", reason: "x" }, /unknown key/],
    [{ op: "todo.delete", id: "" }, /non-empty string/],
    [{ op: "project.update", id: "pr1" }, /at least one/],
    [{ op: "project_doc.update", id: "d1" }, /at least one/],
    [{ op: "project.create", title: "P", note: "x" }, /unknown key/],
    [{ op: "project_doc.create", projectId: "pr1", title: "t", sortOrder: 0 }, /unknown key/],
    [{ op: "project_doc.create", title: "t" }, /non-empty string/],
    ["not an object", /ops\[0\]/],
  ])("rejects %j", (op, message) => {
    expect(() => parseOps(op)).toThrowError(message);
  });
});

describe("op references", () => {
  const parseOps = (...ops: unknown[]) => parseApply({ ...base, ops }).ops;

  it("resolves $N to an earlier create of the right entity", () => {
    const ops = parseOps(
      { op: "todo.create", title: "C-1" },
      { op: "plan.create", todoId: "$0", start: "10:00", end: "12:00" },
      { op: "plan.update", id: "$1", end: "13:00" },
      { op: "todo.update", id: "$0", note: "split from C" }
    );
    expect(ops[1]).toMatchObject({ todoRef: { kind: "created", index: 0 } });
    expect(ops[2]).toMatchObject({ ref: { kind: "created", index: 1 } });
    expect(ops[3]).toMatchObject({ ref: { kind: "created", index: 0 } });
  });

  it("passes a literal id through untouched", () => {
    const [op] = parseOps({ op: "todo.delete", id: "aB3_x-9" });
    expect(op).toMatchObject({ ref: { kind: "id", id: "aB3_x-9" } });
  });

  it("rejects a forward or self reference", () => {
    expect(() => parseOps({ op: "todo.delete", id: "$0" })).toThrowError(/earlier op/);
    expect(() =>
      parseOps({ op: "todo.create", title: "A" }, { op: "todo.delete", id: "$1" })
    ).toThrowError(/earlier op/);
  });

  it("rejects a reference to a non-create op", () => {
    expect(() =>
      parseOps({ op: "todo.update", id: "t1", done: true }, { op: "todo.delete", id: "$0" })
    ).toThrowError(/must reference a todo\.create/);
  });

  it("rejects a reference to a create of the other entity", () => {
    expect(() =>
      parseOps(
        { op: "todo.create", title: "A" },
        { op: "plan.delete", id: "$0" }
      )
    ).toThrowError(/must reference a plan\.create/);
  });

  it("resolves a doc create's projectId to an earlier project create", () => {
    const ops = parseOps(
      { op: "project.create", title: "P" },
      { op: "project_doc.create", projectId: "$0", title: "decisions" },
      { op: "project_doc.update", id: "$1", append: "first line" }
    );
    expect(ops[1]).toMatchObject({ projectRef: { kind: "created", index: 0 } });
    expect(ops[2]).toMatchObject({ ref: { kind: "created", index: 1 } });
  });

  it("lifts a $N projectId out of a todo body", () => {
    const ops = parseOps(
      { op: "project.create", title: "P" },
      { op: "todo.create", title: "first action", date: null, projectId: "$0" },
      { op: "todo.update", id: "t9", projectId: "$0" }
    );
    expect(ops[1]).toEqual({
      kind: "todo.create",
      input: { title: "first action", date: null },
      projectRef: { kind: "created", index: 0 },
    });
    // Only the ref: the executor puts the resolved id back, so this is still
    // a real patch and not an empty one.
    expect(ops[2]).toMatchObject({
      patch: {},
      projectRef: { kind: "created", index: 0 },
    });
  });

  it("leaves a literal or null projectId in the todo body", () => {
    const [literal, unfiled] = parseOps(
      { op: "todo.create", title: "A", projectId: "pr1" },
      { op: "todo.update", id: "t1", projectId: null }
    );
    expect(literal).toEqual({
      kind: "todo.create",
      input: { title: "A", projectId: "pr1" },
      projectRef: undefined,
    });
    expect(unfiled).toMatchObject({ patch: { projectId: null } });
  });

  it("rejects a todo's projectId pointed at anything but a project create", () => {
    expect(() =>
      parseOps(
        { op: "todo.create", title: "A" },
        { op: "todo.create", title: "B", projectId: "$0" }
      )
    ).toThrowError(/must reference a project\.create/);
  });

  it("rejects a doc create pointed at a todo create", () => {
    expect(() =>
      parseOps(
        { op: "todo.create", title: "A" },
        { op: "project_doc.create", projectId: "$0", title: "decisions" }
      )
    ).toThrowError(/must reference a project\.create/);
  });

  it("rejects a project op pointed at a doc create and the reverse", () => {
    expect(() =>
      parseOps(
        { op: "project_doc.create", projectId: "pr1", title: "t" },
        { op: "project.delete", id: "$0" }
      )
    ).toThrowError(/must reference a project\.create/);
    expect(() =>
      parseOps(
        { op: "project.create", title: "P" },
        { op: "project_doc.delete", id: "$0" }
      )
    ).toThrowError(/must reference a project_doc\.create/);
  });

  it("rejects a malformed $ reference instead of treating it as an id", () => {
    expect(() => parseOps({ op: "todo.delete", id: "$01" })).toThrowError(
      /not a valid op reference/
    );
    expect(() => parseOps({ op: "todo.delete", id: "$x" })).toThrowError(
      /not a valid op reference/
    );
  });
});
