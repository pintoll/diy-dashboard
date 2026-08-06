import type { TextEdit } from "@shared/text-history";

// Contract for the memo store — the dashboard's scratch memory. One memo per
// memo-pad widget instance, keyed by that instance's id.
//
// The renderer owns the live buffer and its undo history (see
// @shared/text-history); main is the durable mirror. That split is why a write
// carries the whole `body` alongside the single `edit` that produced it: the
// body is what a restart reads back, the edit is what makes the restart still
// undoable.

export type MemoRow = {
  id: string;
  body: string;
  history_cursor: number;
  created_at: string;
  updated_at: string;
};

export type MemoSnapshot = {
  id: string;
  body: string;
  createdAt: string;
};

export type MemoSnapshotRow = {
  id: string;
  body: string;
  created_at: string;
};

export type MemoState = {
  id: string;
  body: string;
  // seq of the last edit applied to `body`. Edits above it are the redo tail.
  cursor: number;
  edits: TextEdit[];
  snapshots: MemoSnapshot[];
  updatedAt: string;
};

// `edit.seq` doubles as the new cursor, so it is not sent twice.
export type MemoCommitEditInput = {
  id: string;
  body: string;
  edit: TextEdit;
};

// Undo/redo: the cursor moves and the body follows, but no edit is recorded.
export type MemoMoveCursorInput = {
  id: string;
  body: string;
  cursor: number;
};

export type MemoWriteResult = {
  updatedAt: string;
};

// A memo whose widget is gone. `memos.id` is a widget instanceId and that id
// lives only in the renderer's localStorage, so removing the widget leaves the
// row with nothing pointing at it. The body is not sent — one of these lists
// can span every memo ever written — only enough to recognise it by.
export type MemoOrphan = {
  id: string;
  preview: string;
  charCount: number;
  snapshotCount: number;
  updatedAt: string;
};

// Hands an orphan's text, history and snapshots to a live widget's memo, which
// is how a removed memo becomes reachable again.
export type MemoAdoptInput = {
  targetId: string;
  sourceId: string;
};

export class MemoValidationError extends Error {}
