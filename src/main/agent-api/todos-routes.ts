import { today } from "@shared/day";
import { getActiveTodo, setActiveTodo } from "../todos/active";
import { addToDesk, clearDesk, getDesk, removeFromDesk } from "../todos/desk";
import {
  createTodo,
  deleteTodo,
  listBacklog,
  listOverdue,
  listTodos,
  listTodosByIds,
  updateTodo,
} from "../todos/crud";
import type { ReasonInput } from "../todos/journal";
import { ValidationError } from "../todos/types";
import type { TodoCreateInput, TodoPatch } from "../todos/types";
import { readJsonBody, sendJson, type Route } from "./router";

// The todos surface of the agent API. Route handlers only translate
// HTTP <-> the same domain functions the IPC layer calls, so validation,
// semantics, and todos:changed pushes are identical no matter who writes.

export function asObject(body: unknown, what: string): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError(`${what} must be a JSON object`);
  }
  return body as Record<string, unknown>;
}

// Rejects body keys outside `allowed`. The callers are agents that trust
// status codes, so a misnamed field must 400 loudly: dropping it silently
// turns "planned tomorrow" into "planned today" (POST /api/plan with "date"
// for "day") or returns 200 for a patch that applied nothing (PATCH
// /api/plan/:id with keys the route deliberately ignores).
export function assertOnlyKeys(
  body: Record<string, unknown>,
  allowed: string[],
  what: string
): void {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new ValidationError(
      `${what} has unknown key(s): ${unknown.join(", ")}; allowed: ${allowed.join(", ")}`
    );
  }
}

// Validates an optional caller-supplied reason ("--reason" in dyd) for the
// write context. The row itself is minted lazily by resolveReasonId inside the
// write's transaction (journal.ts), so a write that journals nothing — failed
// validation, unknown id, no-change patch — leaves no orphan reasons row.
// JSON `null` is treated as absent, not rejected: the DELETE query param has
// no way to distinguish the two (URLSearchParams.get returns null), and some
// client serializers emit null for omitted optionals (docs/spec/todos-agent-api.md).
// Exported for every routes file that journals (day-routes.ts) — the
// null-vs-blank semantics must not fork per surface.
export function agentReason(reason: unknown): ReasonInput | undefined {
  if (reason === undefined || reason === null) return undefined;
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new ValidationError("reason must be a non-empty string");
  }
  return { source: "agent", text: reason.trim() };
}

export const todosRoutes: Route[] = [
  // The app's day (05:00 to 05:00 Asia/Seoul, src/shared/day.ts). Clients must
  // ask for it rather than read their own clock: between midnight and 05:00
  // the calendar date is one day ahead of the day every other route means by
  // "today", and a client-side copy of the boundary is exactly the drift the
  // shared module exists to prevent.
  {
    method: "GET",
    pattern: "/api/today",
    handler: (_req, res) => {
      sendJson(res, 200, { date: today() });
    },
  },
  {
    method: "GET",
    pattern: "/api/todos",
    handler: (_req, res, _params, query) => {
      const date = query.get("date");
      const from = query.get("from");
      const to = query.get("to");
      const filter =
        from !== null && to !== null
          ? { from, to }
          : { date: date ?? today() };
      sendJson(res, 200, { todos: listTodos(filter) });
    },
  },
  {
    method: "GET",
    pattern: "/api/todos/overdue",
    handler: (_req, res) => {
      sendJson(res, 200, { todos: listOverdue(today()) });
    },
  },
  // The backlog: todos with `"date": null`. They are excluded from every dated
  // query by construction, so this is the only route that returns them.
  {
    method: "GET",
    pattern: "/api/todos/backlog",
    handler: (_req, res) => {
      sendJson(res, 200, { todos: listBacklog() });
    },
  },
  // Batch resolution for callers holding bare todo ids — plan entries
  // reference todos that may live on another day, in the backlog, or be done.
  // Deleted ids drop out of the result rather than 404ing (the caller shows a
  // fallback), mirroring the todos:by-ids IPC.
  {
    method: "GET",
    pattern: "/api/todos/by-ids",
    handler: (_req, res, _params, query) => {
      const raw = query.get("ids");
      if (raw === null || raw.trim().length === 0) {
        throw new ValidationError("ids must be a comma-separated list of todo ids");
      }
      const ids = raw
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      sendJson(res, 200, { todos: listTodosByIds(ids) });
    },
  },
  {
    method: "POST",
    pattern: "/api/todos",
    handler: async (req, res) => {
      const body = asObject(await readJsonBody(req), "body");
      // `reason` rides in the body but is journal metadata, not todo input —
      // strip it so the cast below stays honest.
      const reason = agentReason(body.reason);
      delete body.reason;
      // Anything created through this API is agent-authored by definition.
      const todo = createTodo(body as TodoCreateInput, { source: "agent", reason });
      sendJson(res, 201, { todo });
    },
  },
  {
    method: "PATCH",
    pattern: "/api/todos/:id",
    handler: async (req, res, params) => {
      const body = asObject(await readJsonBody(req), "body");
      const reason = agentReason(body.reason);
      delete body.reason;
      const todo = updateTodo(params.id, body as TodoPatch, { source: "agent", reason });
      sendJson(res, 200, { todo });
    },
  },
  {
    method: "DELETE",
    pattern: "/api/todos/:id",
    // DELETE reads no body, so the reason travels as a query param.
    handler: (_req, res, params, query) => {
      const reason = agentReason(query.get("reason"));
      deleteTodo(params.id, { source: "agent", reason });
      sendJson(res, 204, undefined);
    },
  },
  // The desk: the set of todos receiving the running work clock. Every member
  // accrues time (docs/design/multi-pomo-todo.md). Add is additive — it does not
  // replace the desk. Errors bubble to the central handler: unknown id → 404
  // (on remove as well as add, so a typo'd id is not reported as a success),
  // completed todo → 400.
  {
    method: "GET",
    pattern: "/api/desk",
    handler: (_req, res) => {
      sendJson(res, 200, { todos: getDesk() });
    },
  },
  {
    method: "POST",
    pattern: "/api/desk",
    handler: async (req, res) => {
      const body = asObject(await readJsonBody(req), "body");
      const id = body.id;
      if (typeof id !== "string") {
        throw new ValidationError("id must be a todo id string");
      }
      addToDesk(id, { source: "agent" });
      sendJson(res, 200, { todos: getDesk() });
    },
  },
  {
    method: "DELETE",
    pattern: "/api/desk",
    handler: (_req, res) => {
      clearDesk();
      sendJson(res, 200, { todos: getDesk() });
    },
  },
  {
    method: "DELETE",
    pattern: "/api/desk/:id",
    handler: (_req, res, params) => {
      removeFromDesk(params.id);
      sendJson(res, 200, { todos: getDesk() });
    },
  },
  // --- Deprecated single-active compat (one release) -------------------------
  // `getActiveTodo`/`setActiveTodo` now map onto the desk (desk[0] / collapse).
  // Kept so un-updated `dyd` installs keep working; new clients use /api/desk.
  {
    method: "GET",
    pattern: "/api/active-todo",
    handler: (_req, res) => {
      sendJson(res, 200, { todo: getActiveTodo() });
    },
  },
  {
    method: "POST",
    pattern: "/api/active-todo",
    handler: async (req, res) => {
      const body = asObject(await readJsonBody(req), "body");
      const id = body.id;
      if (id !== null && typeof id !== "string") {
        throw new ValidationError("id must be a todo id string or null");
      }
      sendJson(res, 200, { todo: setActiveTodo(id, { source: "agent" }) });
    },
  },
];
