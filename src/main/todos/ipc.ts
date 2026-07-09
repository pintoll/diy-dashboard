import { ipcMain } from "electron";
import { getActiveTodo, setActiveTodo } from "./active";
import {
  createTodo,
  deleteTodo,
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

  ipcMain.handle(
    "todos:reorder",
    (_event, payload: { date: string; ids: string[] }): void =>
      reorderTodos(payload.date, payload.ids)
  );

  ipcMain.handle("todos:active:get", (): Todo | null => getActiveTodo());

  ipcMain.handle("todos:active:set", (_event, id: string | null): Todo | null =>
    setActiveTodo(id)
  );

  ipcMain.handle("todos:record-work", (_event, input: RecordWorkInput): void =>
    recordWork(input)
  );
}
