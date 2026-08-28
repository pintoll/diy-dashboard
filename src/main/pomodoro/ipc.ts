import { ipcMain } from "electron";
import {
  listSessions,
  recordSession,
  updateSessionNote,
} from "./sessions";
import type { PomodoroSession } from "./types";

export function registerPomodoroIpc(): void {
  ipcMain.handle("pomodoro:sessions:list", (): PomodoroSession[] => listSessions());

  ipcMain.handle(
    "pomodoro:sessions:record",
    (_event, session: PomodoroSession): void => {
      recordSession(session);
    }
  );

  ipcMain.handle(
    "pomodoro:sessions:update-note",
    (_event, payload: { id: string; note: string | null }): void => {
      updateSessionNote(payload.id, payload.note);
    }
  );
}
