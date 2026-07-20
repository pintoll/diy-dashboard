import { BrowserWindow, ipcMain } from "electron";
import { nanoid } from "nanoid";
import { getDesk } from "../todos/desk";
import {
  computeOvertimeElapsedSec,
  computeRemainingSec,
} from "@shared/pomodoro-time";

// The pomodoro timer's authority lives in the renderer Zustand store, not in
// main. This module is the main half of a request/reply bridge to it:
//
// - Reads: the renderer pushes a raw snapshot on every store transition
//   (pomodoro:bridge:snapshot). We cache it and recompute the live fields
//   (remainingSec, overtime.elapsedSec) here at request time, so a poll is
//   always fresh without any per-second traffic.
// - Commands: we forward the action to the renderer (pomodoro:bridge:command)
//   with a correlation id and await its guarded result
//   (pomodoro:bridge:command-result), or time out into a 504.
//
// The desk is NOT taken from the renderer: main owns the desk rows
// (todos/desk.ts), so we enrich the snapshot with it here.

// Raw store inputs — kept in sync with the renderer PomodoroBridgeController's
// buildSnapshot. We recompute the derived fields rather than trust a value that
// goes stale between transitions.
export type PomodoroRawSnapshot = {
  phase: "work" | "shortBreak" | "longBreak";
  isRunning: boolean;
  startedAt: number | null;
  pausedTimeRemaining: number | null;
  phaseDurationSec: number;
  completedPomodoros: number;
  presetId: string;
  overtime: {
    startedAt: number;
    accumulatedSec: number;
    lastActiveAt: number;
    isIdle: boolean;
  } | null;
  pendingReview: boolean;
};

type SnapshotPush = { bound: false } | { bound: true; snapshot: PomodoroRawSnapshot };

export type PomodoroCommandAction =
  | "start"
  | "pause"
  | "stop"
  | "skip"
  | "reset"
  | "set-preset"
  | "stop-overtime";

type CommandResult = { applied: boolean; reason?: string; snapshot: PomodoroRawSnapshot };

// The GET /api/pomodoro body shape, with the live fields recomputed.
export type PomodoroApiState = {
  phase: PomodoroRawSnapshot["phase"];
  isRunning: boolean;
  remainingSec: number;
  phaseDurationSec: number;
  completedPomodoros: number;
  presetId: string;
  overtime: { elapsedSec: number; isIdle: boolean } | null;
  pendingReview: boolean;
  // The set of todos currently on the desk (all accrue the running work clock).
  desk: { id: string; title: string }[];
  // Deprecated alias = desk[0] ?? null, kept one release for un-updated dyd.
  activeTodo: { id: string; title: string } | null;
};

export class BridgeNotReadyError extends Error {}
export class BridgeTimeoutError extends Error {}

const COMMAND_TIMEOUT_MS = 1500;

let latest: SnapshotPush = { bound: false };
const pending = new Map<
  string,
  { resolve: (result: CommandResult) => void; timer: ReturnType<typeof setTimeout> }
>();

// The dashboard window, tracked explicitly rather than picked out of
// getAllWindows(): only this one mounts PomodoroBridgeController, so a second
// window (settings, auth) must never be handed a command it will not answer —
// that would burn the full COMMAND_TIMEOUT_MS and return a 504 instead of acting.
let dashboardWindow: BrowserWindow | null = null;

export function setPomodoroBridgeWindow(win: BrowserWindow | null): void {
  dashboardWindow = win;
}

// The derived fields come from the same module the renderer store computes them
// with, so a poll can never report a rule the widget no longer follows.
function recomputeOvertime(
  s: PomodoroRawSnapshot,
  now: number
): { elapsedSec: number; isIdle: boolean } | null {
  if (s.overtime === null) return null;
  return {
    elapsedSec: computeOvertimeElapsedSec(s.overtime, now),
    isIdle: s.overtime.isIdle,
  };
}

function toApiState(s: PomodoroRawSnapshot): PomodoroApiState {
  const desk = getDesk().map((t) => ({ id: t.id, title: t.title }));
  const now = Date.now();
  return {
    phase: s.phase,
    isRunning: s.isRunning,
    remainingSec: computeRemainingSec(s, s.phaseDurationSec, now),
    phaseDurationSec: s.phaseDurationSec,
    completedPomodoros: s.completedPomodoros,
    presetId: s.presetId,
    overtime: recomputeOvertime(s, now),
    pendingReview: s.pendingReview,
    desk,
    activeTodo: desk[0] ?? null,
  };
}

/** Live pomodoro state, or null when no renderer bridge is bound (→ 503). */
export function getPomodoroState(): PomodoroApiState | null {
  if (!latest.bound) return null;
  return toApiState(latest.snapshot);
}

/**
 * Forward a command to the renderer bridge and await its guarded result.
 * Throws BridgeNotReadyError (→ 503) when no bridge/window is available and
 * BridgeTimeoutError (→ 504) when the renderer does not reply in time.
 */
export async function sendPomodoroCommand(
  action: PomodoroCommandAction,
  presetId?: string
): Promise<{ applied: boolean; reason?: string; state: PomodoroApiState }> {
  if (!latest.bound) throw new BridgeNotReadyError("pomodoro bridge not ready");
  const win = dashboardWindow;
  if (!win || win.isDestroyed()) {
    throw new BridgeNotReadyError("pomodoro bridge not ready");
  }

  const id = nanoid();
  const result = await new Promise<CommandResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new BridgeTimeoutError("pomodoro bridge did not respond"));
    }, COMMAND_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    try {
      win.webContents.send("pomodoro:bridge:command", { id, action, presetId });
    } catch (error) {
      // The window can be destroyed between the check above and this send. Left
      // unhandled the throw escapes the executor, the timer never clears and the
      // entry leaks in `pending`, so the caller waits out the timeout for a
      // 504 where the honest answer is an immediate 503.
      clearTimeout(timer);
      pending.delete(id);
      reject(new BridgeNotReadyError(`pomodoro bridge unreachable: ${String(error)}`));
    }
  });

  latest = { bound: true, snapshot: result.snapshot };
  return { applied: result.applied, reason: result.reason, state: toApiState(result.snapshot) };
}

export function registerPomodoroBridgeIpc(): void {
  ipcMain.on("pomodoro:bridge:snapshot", (_event, payload: SnapshotPush) => {
    latest =
      payload && payload.bound === true
        ? { bound: true, snapshot: payload.snapshot }
        : { bound: false };
  });

  ipcMain.on(
    "pomodoro:bridge:command-result",
    (_event, payload: { id: string } & CommandResult) => {
      const entry = pending.get(payload.id);
      if (!entry) return; // already timed out, or unknown id
      clearTimeout(entry.timer);
      pending.delete(payload.id);
      entry.resolve({
        applied: payload.applied,
        reason: payload.reason,
        snapshot: payload.snapshot,
      });
    }
  );
}
