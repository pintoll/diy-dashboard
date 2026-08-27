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
import { ValidationError } from "../todos/types";
import type { TodoCreateInput, TodoPatch } from "../todos/types";
import {
  asObject,
  TODO_CREATE_KEYS,
  TODO_PATCH_KEYS,
} from "../todos/validate";
import { agentDeleteContext, readAgentWrite } from "./request";
import { readJsonBody, sendJson, type Route } from "./router";

// The todos surface of the agent API. Route handlers only translate
// HTTP <-> the same domain functions the IPC layer calls, so validation,
// semantics, and todos:changed pushes are identical no matter who writes.
// Key policy comes from todos/validate.ts, shared with the batch parser
// (todos/apply-ops.ts), so the two write surfaces accept the same bodies;
// reading a write's body and its journal reason comes from request.ts, shared
// with every other routes file that journals.

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
      const { input, ctx } = await readAgentWrite<TodoCreateInput>(req, TODO_CREATE_KEYS);
      sendJson(res, 201, { todo: createTodo(input, ctx) });
    },
  },
  {
    method: "PATCH",
    pattern: "/api/todos/:id",
    handler: async (req, res, params) => {
      const { input, ctx } = await readAgentWrite<TodoPatch>(req, TODO_PATCH_KEYS);
      sendJson(res, 200, { todo: updateTodo(params.id, input, ctx) });
    },
  },
  {
    method: "DELETE",
    pattern: "/api/todos/:id",
    handler: (_req, res, params, query) => {
      deleteTodo(params.id, agentDeleteContext(query));
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
