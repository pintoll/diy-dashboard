import { ipcMain } from "electron";
import {
  adoptMemo,
  commitEdit,
  createSnapshot,
  deleteMemo,
  deleteSnapshot,
  listOrphans,
  listSnapshots,
  loadMemo,
  moveCursor,
} from "./crud";
import type {
  MemoAdoptInput,
  MemoCommitEditInput,
  MemoMoveCursorInput,
  MemoOrphan,
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

  // Recovery. The renderer is the only side that knows which memos still have a
  // widget, so it passes that set in.
  ipcMain.handle(
    "memos:list-orphans",
    (_event, liveIds: string[]): MemoOrphan[] => listOrphans(liveIds)
  );

  ipcMain.handle(
    "memos:adopt",
    (_event, input: MemoAdoptInput): MemoState => adoptMemo(input)
  );

  ipcMain.handle("memos:delete", (_event, id: string): void => deleteMemo(id));
}
