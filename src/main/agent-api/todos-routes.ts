import { getActiveTodo, setActiveTodo } from "../todos/active";
import {
  createTodo,
  deleteTodo,
  listOverdue,
  listTodos,
  updateTodo,
} from "../todos/crud";
import { kstToday } from "../todos/date";
import { ValidationError } from "../todos/types";
import type { TodoCreateInput, TodoPatch } from "../todos/types";
import { readJsonBody, sendJson, type Route } from "./router";

// The todos surface of the agent API. Route handlers only translate
// HTTP <-> the same domain functions the IPC layer calls, so validation,
// semantics, and todos:changed pushes are identical no matter who writes.

function asObject(body: unknown, what: string): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError(`${what} must be a JSON object`);
  }
  return body as Record<string, unknown>;
}

export const todosRoutes: Route[] = [
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
          : { date: date ?? kstToday() };
      sendJson(res, 200, { todos: listTodos(filter) });
    },
  },
  {
    method: "GET",
    pattern: "/api/todos/overdue",
    handler: (_req, res) => {
      sendJson(res, 200, { todos: listOverdue(kstToday()) });
    },
  },
  {
    method: "POST",
    pattern: "/api/todos",
    handler: async (req, res) => {
      const body = asObject(await readJsonBody(req), "body");
      // Anything created through this API is agent-authored by definition.
      const todo = createTodo(body as TodoCreateInput, "agent");
      sendJson(res, 201, { todo });
    },
  },
  {
    method: "PATCH",
    pattern: "/api/todos/:id",
    handler: async (req, res, params) => {
      const body = asObject(await readJsonBody(req), "body");
      const todo = updateTodo(params.id, body as TodoPatch);
      sendJson(res, 200, { todo });
    },
  },
  {
    method: "DELETE",
    pattern: "/api/todos/:id",
    handler: (_req, res, params) => {
      deleteTodo(params.id);
      sendJson(res, 204, undefined);
    },
  },
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
      sendJson(res, 200, { todo: setActiveTodo(id) });
    },
  },
];
