import {
  ValidationError,
  type PlanEntryCreateInput,
  type PlanEntryPatch,
  type ProjectCreateInput,
  type ProjectDocCreateInput,
  type ProjectDocPatch,
  type ProjectPatch,
  type TodoCreateInput,
  type TodoPatch,
} from "./types";

// Request validation shared by the two write surfaces: the single-op agent
// routes (agent-api/todos-routes.ts, day-routes.ts) and the assistant's batch
// parser (apply-ops.ts). Both parse untrusted JSON into the same DTOs, so the
// key policy belongs in one place — a body that 400s on one surface must 400
// on the other, or a caller calibrated on one silently misfiles through the
// other (`{"title": "t", "day": "..."}` is a loud 400 through /api/apply and a
// todo quietly dated today through POST /api/todos). Lives in the todos layer
// because agent-api may import downward from it, never the reverse.

export function asObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError(`${what} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

// Rejects keys outside `allowed`. The callers are agents that trust status
// codes, so a misnamed field must 400 loudly: dropping it silently turns
// "planned tomorrow" into "planned today" (POST /api/plan with "date" for
// "day") or returns 200 for a patch that applied nothing.
export function assertOnlyKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  what: string
): void {
  const unknown = Object.keys(obj).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new ValidationError(
      `${what} has unknown key(s): ${unknown.join(", ")}; allowed: ${allowed.join(", ")}`
    );
  }
}

// The allowlists, pinned to the DTOs they parse into: `satisfies Record<keyof
// T, true>` turns a field added to or renamed in types.ts into a compile error
// here, instead of a key one surface accepts and the other rejects. Transport
// wrappers (`reason` on the routes, `op`/`id` in a batch) are added at the
// call site — they are not part of the domain input.
export const TODO_CREATE_KEYS = Object.keys({
  title: true,
  date: true,
  note: true,
  projectId: true,
} satisfies Record<keyof TodoCreateInput, true>);

export const TODO_PATCH_KEYS = Object.keys({
  title: true,
  note: true,
  date: true,
  done: true,
  sortOrder: true,
  projectId: true,
} satisfies Record<keyof TodoPatch, true>);

export const PROJECT_CREATE_KEYS = Object.keys({
  title: true,
  kind: true,
  outcome: true,
  status: true,
  targetDate: true,
} satisfies Record<keyof ProjectCreateInput, true>);

export const PROJECT_PATCH_KEYS = Object.keys({
  title: true,
  kind: true,
  outcome: true,
  status: true,
  targetDate: true,
  sortOrder: true,
} satisfies Record<keyof ProjectPatch, true>);

export const PROJECT_DOC_CREATE_KEYS = Object.keys({
  title: true,
  body: true,
} satisfies Record<keyof ProjectDocCreateInput, true>);

export const PROJECT_DOC_PATCH_KEYS = Object.keys({
  title: true,
  body: true,
  append: true,
} satisfies Record<keyof ProjectDocPatch, true>);

export const PLAN_CREATE_KEYS = Object.keys({
  todoId: true,
  day: true,
  start: true,
  end: true,
} satisfies Record<keyof PlanEntryCreateInput, true>);

export const PLAN_PATCH_KEYS = Object.keys({
  start: true,
  end: true,
} satisfies Record<keyof PlanEntryPatch, true>);
