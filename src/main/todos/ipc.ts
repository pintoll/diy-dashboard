import { ipcMain } from "electron";
import { getActiveTodo, setActiveTodo } from "./active";
import { addToDesk, clearDesk, getDesk, removeFromDesk } from "./desk";
import {
  createTodo,
  deleteTodo,
  getTodoTitlesByIds,
  listOverdue,
  listTodos,
  reorderTodos,
  updateTodo,
} from "./crud";
import { kstToday } from "./date";
import { recordWork } from "./sessions";
import type {
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
        : { date: kstToday() };
    return listTodos(resolved);
  });

  ipcMain.handle("todos:overdue", (_event, before?: string): Todo[] =>
    listOverdue(before ?? kstToday())
  );

  ipcMain.handle("todos:create", (_event, input: TodoCreateInput): Todo =>
    createTodo(input, "user")
  );

  ipcMain.handle(
    "todos:update",
    (_event, payload: { id: string; patch: TodoPatch }): Todo =>
      updateTodo(payload.id, payload.patch)
  );

  ipcMain.handle("todos:delete", (_event, id: string): void => deleteTodo(id));

  // Batch id -> title resolve for the analytics drill-down; deleted ids drop out.
  ipcMain.handle(
    "todos:titles-by-ids",
    (_event, ids: string[]): { id: string; title: string }[] =>
      getTodoTitlesByIds(ids)
  );

  ipcMain.handle(
    "todos:reorder",
    (_event, payload: { date: string; ids: string[] }): void =>
      reorderTodos(payload.date, payload.ids)
  );

  // Single-active compat (agent API + un-migrated callers). The renderer speaks
  // the desk channels below; both write the same `desk` table.
  ipcMain.handle("todos:active:get", (): Todo | null => getActiveTodo());

  ipcMain.handle("todos:active:set", (_event, id: string | null): Todo | null =>
    setActiveTodo(id)
  );

  // The desk: the set of todos receiving the running work clock. Membership,
  // not ownership, routes pomodoro time (docs/design/multi-pomo-todo.md).
  ipcMain.handle("todos:desk:get", (): Todo[] => getDesk());

  ipcMain.handle("todos:desk:add", (_event, id: string): Todo => addToDesk(id));

  ipcMain.handle("todos:desk:remove", (_event, id: string): void =>
    removeFromDesk(id)
  );

  ipcMain.handle("todos:desk:clear", (): void => clearDesk());

  ipcMain.handle("todos:record-work", (_event, input: RecordWorkInput): void =>
    recordWork(input)
  );
}
