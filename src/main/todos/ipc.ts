import { ipcMain } from "electron";
import { today } from "@shared/day";
import { getActiveTodo, setActiveTodo } from "./active";
import { addToDesk, clearDesk, getDesk, removeFromDesk } from "./desk";
import {
  createTodo,
  deleteTodo,
  getTodoTitlesByIds,
  listBacklog,
  listOverdue,
  listTodos,
  listTodosByIds,
  reorderTodos,
  updateTodo,
} from "./crud";
import { resolveYesterday } from "./fold";
import {
  createPlanEntry,
  deletePlanEntry,
  listPlanEntries,
  updatePlanEntry,
} from "./plan";
import { recordWork } from "./sessions";
import type {
  PlanEntry,
  PlanEntryCreateInput,
  PlanEntryPatch,
  RecordWorkInput,
  Todo,
  TodoCreateInput,
  TodoListFilter,
  TodoPatch,
} from "./types";

export function registerTodosIpc(): void {
  ipcMain.handle("todos:list", (_event, filter?: TodoListFilter): Todo[] => {
    const resolved =
      filter && (filter.date !== undefined || filter.from !== undefined)
        ? filter
        : { date: today() };
    return listTodos(resolved);
  });

  ipcMain.handle("todos:overdue", (_event, before?: string): Todo[] =>
    listOverdue(before ?? today())
  );

  // The backlog: todos with no planned day. Not reachable through todos:list,
  // whose filters are date-based by construction.
  ipcMain.handle("todos:backlog", (): Todo[] => listBacklog());

  ipcMain.handle("todos:create", (_event, input: TodoCreateInput): Todo =>
    createTodo(input, { source: "user" })
  );

  ipcMain.handle(
    "todos:update",
    (_event, payload: { id: string; patch: TodoPatch }): Todo =>
      updateTodo(payload.id, payload.patch, { source: "user" })
  );

  ipcMain.handle("todos:delete", (_event, id: string): void =>
    deleteTodo(id, { source: "user" })
  );

  // Batch id -> title resolve for the analytics drill-down; deleted ids drop out.
  ipcMain.handle(
    "todos:titles-by-ids",
    (_event, ids: string[]): { id: string; title: string }[] =>
      getTodoTitlesByIds(ids)
  );

  ipcMain.handle(
    "todos:reorder",
    (_event, payload: { date: string | null; ids: string[] }): void =>
      reorderTodos(payload.date, payload.ids)
  );

  // Single-active compat (agent API + un-migrated callers). The renderer speaks
  // the desk channels below; both write the same `desk` table.
  ipcMain.handle("todos:active:get", (): Todo | null => getActiveTodo());

  ipcMain.handle("todos:active:set", (_event, id: string | null): Todo | null =>
    setActiveTodo(id, { source: "user" })
  );

  // The desk: the set of todos receiving the running work clock. Membership,
  // not ownership, routes pomodoro time (docs/design/multi-pomo-todo.md).
  ipcMain.handle("todos:desk:get", (): Todo[] => getDesk());

  ipcMain.handle("todos:desk:add", (_event, id: string): Todo =>
    addToDesk(id, { source: "user" })
  );

  ipcMain.handle("todos:desk:remove", (_event, id: string): void =>
    removeFromDesk(id)
  );

  ipcMain.handle("todos:desk:clear", (): void => clearDesk());

  ipcMain.handle("todos:record-work", (_event, input: RecordWorkInput): void =>
    recordWork(input)
  );

  // The day sheet's plan surface (docs/design/assistant-architecture.md step
  // 6). Widget edits are ordinary journaled ops: source "user", never a reason.
  ipcMain.handle("todos:plan:list", (_event, day?: string): PlanEntry[] =>
    listPlanEntries(day ?? today())
  );

  ipcMain.handle(
    "todos:plan:create",
    (_event, input: PlanEntryCreateInput): PlanEntry =>
      createPlanEntry(input, { source: "user" })
  );

  ipcMain.handle(
    "todos:plan:update",
    (_event, payload: { id: string; patch: PlanEntryPatch }): PlanEntry =>
      updatePlanEntry(payload.id, payload.patch, { source: "user" })
  );

  ipcMain.handle("todos:plan:delete", (_event, id: string): void =>
    deletePlanEntry(id, { source: "user" })
  );

  // resolveYesterday(): the last pre-today day with records after the last
  // fold; null = fully folded. Feeds the sheet's "yesterday unfolded" hint.
  ipcMain.handle("todos:yesterday", (): string | null => resolveYesterday());

  // Full-row batch resolve for the plan-entry join; deleted ids drop out.
  ipcMain.handle("todos:by-ids", (_event, ids: string[]): Todo[] =>
    listTodosByIds(ids)
  );
}
