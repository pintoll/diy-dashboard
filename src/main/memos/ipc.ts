import { ipcMain } from "electron";
import {
  commitEdit,
  createSnapshot,
  deleteSnapshot,
  listSnapshots,
  loadMemo,
  moveCursor,
} from "./crud";
import type {
  MemoCommitEditInput,
  MemoMoveCursorInput,
  MemoSnapshot,
  MemoState,
  MemoWriteResult,
} from "./types";

export function registerMemosIpc(): void {
  // Creates the memo on first sight, so the widget never needs a separate
  // "new memo" round trip.
  ipcMain.handle("memos:load", (_event, id: string): MemoState => loadMemo(id));

  ipcMain.handle(
    "memos:commit-edit",
    (_event, input: MemoCommitEditInput): MemoWriteResult => commitEdit(input)
  );

  ipcMain.handle(
    "memos:move-cursor",
    (_event, input: MemoMoveCursorInput): MemoWriteResult => moveCursor(input)
  );

  ipcMain.handle(
    "memos:snapshot:create",
    (_event, payload: { id: string; body: string }): MemoSnapshot =>
      createSnapshot(payload.id, payload.body)
  );

  ipcMain.handle(
    "memos:snapshot:list",
    (_event, id: string): MemoSnapshot[] => listSnapshots(id)
  );

  ipcMain.handle("memos:snapshot:delete", (_event, id: string): void =>
    deleteSnapshot(id)
  );
}
