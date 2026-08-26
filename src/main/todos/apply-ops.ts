import { ValidationError } from "./types";
import {
  asObject,
  assertOnlyKeys,
  PLAN_CREATE_KEYS,
  PLAN_PATCH_KEYS,
  TODO_CREATE_KEYS,
  TODO_PATCH_KEYS,
} from "./validate";

// Pure parsing/validation for the assistant's batch write (POST /api/apply):
// one natural-language reason plus the ops it explains, applied atomically by
// apply.ts (docs/design/assistant-architecture.md). This module is
// deliberately db-free so vitest can cover it; value-level validation (dates,
// plan times, titles, unknown ids) stays with the domain functions the
// executor calls, inside the batch transaction, and the key policy comes from
// validate.ts, so neither can fork from the single-op routes.
//
// An id field may be "$N": the entity created by ops[N] earlier in the same
// batch. That is what lets a split (create C-1, create C-2, delete C, plan
// C-1) stay one intent = one reason instead of two round trips. "$" cannot
// appear in a nanoid, so the sigil is unambiguous.

export type OpRef = { kind: "id"; id: string } | { kind: "created"; index: number };

export type ParsedOp =
  | { kind: "todo.create"; input: Record<string, unknown> }
  | { kind: "todo.update"; ref: OpRef; patch: Record<string, unknown> }
  | { kind: "todo.delete"; ref: OpRef }
  | { kind: "plan.create"; todoRef: OpRef; input: Record<string, unknown> }
  | { kind: "plan.update"; ref: OpRef; patch: Record<string, unknown> }
  | { kind: "plan.delete"; ref: OpRef };

export type ParsedApply = {
  reason: string;
  sessionId?: string;
  ops: ParsedOp[];
};

// A batch is one intent; anything near this bound is a runaway caller, and
// the 64KB request body cap would cut in soon anyway. Loud 400, no truncation.
export const MAX_OPS = 100;

const OP_KINDS = [
  "todo.create",
  "todo.update",
  "todo.delete",
  "plan.create",
  "plan.update",
  "plan.delete",
] as const;

// The plan.create body minus the id: it travels as a parsed ref instead, and
// the executor supplies the resolved id. Derived from the pinned allowlist so
// a field added to PlanEntryCreateInput reaches the executor by default.
const PLAN_CREATE_INPUT_KEYS = PLAN_CREATE_KEYS.filter((key) => key !== "todoId");

function pick(
  obj: Record<string, unknown>,
  keys: readonly string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in obj) out[key] = obj[key];
  }
  return out;
}

const REF_PATTERN = /^\$(0|[1-9]\d*)$/;

function parseRef(
  value: unknown,
  field: string,
  index: number,
  prior: ParsedOp[],
  entity: "todo" | "plan"
): OpRef {
  if (typeof value !== "string" || value.length === 0) {
    throw new ValidationError(`ops[${index}]: ${field} must be a non-empty string`);
  }
  if (!value.startsWith("$")) return { kind: "id", id: value };
  const match = REF_PATTERN.exec(value);
  if (!match) {
    throw new ValidationError(
      `ops[${index}]: ${field} ${JSON.stringify(value)} is not a valid op reference ("$N")`
    );
  }
  const target = Number(match[1]);
  if (target >= index) {
    throw new ValidationError(
      `ops[${index}]: ${field} "$${target}" must reference an earlier op in the batch`
    );
  }
  const expected = `${entity}.create`;
  if (prior[target].kind !== expected) {
    throw new ValidationError(
      `ops[${index}]: ${field} "$${target}" must reference a ${expected} op, but ops[${target}] is ${prior[target].kind}`
    );
  }
  return { kind: "created", index: target };
}

function parseOp(raw: unknown, index: number, prior: ParsedOp[]): ParsedOp {
  const what = `ops[${index}]`;
  const obj = asObject(raw, what);
  switch (obj.op) {
    case "todo.create":
      assertOnlyKeys(obj, ["op", ...TODO_CREATE_KEYS], what);
      return { kind: "todo.create", input: pick(obj, TODO_CREATE_KEYS) };
    case "todo.update": {
      assertOnlyKeys(obj, ["op", "id", ...TODO_PATCH_KEYS], what);
      const patch = pick(obj, TODO_PATCH_KEYS);
      if (Object.keys(patch).length === 0) {
        throw new ValidationError(
          `${what}: todo.update needs at least one of ${TODO_PATCH_KEYS.join(", ")}`
        );
      }
      return {
        kind: "todo.update",
        ref: parseRef(obj.id, "id", index, prior, "todo"),
        patch,
      };
    }
    case "todo.delete":
      assertOnlyKeys(obj, ["op", "id"], what);
      return { kind: "todo.delete", ref: parseRef(obj.id, "id", index, prior, "todo") };
    case "plan.create":
      assertOnlyKeys(obj, ["op", ...PLAN_CREATE_KEYS], what);
      return {
        kind: "plan.create",
        todoRef: parseRef(obj.todoId, "todoId", index, prior, "todo"),
        input: pick(obj, PLAN_CREATE_INPUT_KEYS),
      };
    case "plan.update": {
      assertOnlyKeys(obj, ["op", "id", ...PLAN_PATCH_KEYS], what);
      const patch = pick(obj, PLAN_PATCH_KEYS);
      if (Object.keys(patch).length === 0) {
        throw new ValidationError(
          `${what}: plan.update needs at least one of ${PLAN_PATCH_KEYS.join(", ")}`
        );
      }
      return {
        kind: "plan.update",
        ref: parseRef(obj.id, "id", index, prior, "plan"),
        patch,
      };
    }
    case "plan.delete":
      assertOnlyKeys(obj, ["op", "id"], what);
      return { kind: "plan.delete", ref: parseRef(obj.id, "id", index, prior, "plan") };
    default:
      throw new ValidationError(
        `${what}: unknown op ${JSON.stringify(obj.op)}; expected one of ${OP_KINDS.join(", ")}`
      );
  }
}

export function parseApply(body: unknown): ParsedApply {
  const obj = asObject(body, "body");
  assertOnlyKeys(obj, ["reason", "sessionId", "ops"], "body");

  // The reason is the point of this route — a batch without one belongs to
  // the single-op routes, where reasons are optional.
  if (typeof obj.reason !== "string" || obj.reason.trim().length === 0) {
    throw new ValidationError("reason must be a non-empty string");
  }
  const reason = obj.reason.trim();

  // JSON null is treated as absent for the same reason agentReason does:
  // some client serializers emit null for omitted optionals.
  let sessionId: string | undefined;
  if (obj.sessionId !== undefined && obj.sessionId !== null) {
    if (typeof obj.sessionId !== "string" || obj.sessionId.trim().length === 0) {
      throw new ValidationError("sessionId must be a non-empty string");
    }
    sessionId = obj.sessionId.trim();
  }

  if (!Array.isArray(obj.ops) || obj.ops.length === 0) {
    throw new ValidationError("ops must be a non-empty array");
  }
  if (obj.ops.length > MAX_OPS) {
    throw new ValidationError(
      `ops must have at most ${MAX_OPS} entries, got ${obj.ops.length}`
    );
  }

  const ops: ParsedOp[] = [];
  obj.ops.forEach((raw, index) => {
    ops.push(parseOp(raw, index, ops));
  });
  return { reason, sessionId, ops };
}
