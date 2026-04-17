import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { PomodoroSessionRecord } from "./pomodoro-session.types";

type SessionLogState = {
  sessions: PomodoroSessionRecord[];
  recordSession: (record: Omit<PomodoroSessionRecord, "id">) => void;
  clearAll: () => void;
};

export const useSessionLogStore = create<SessionLogState>()(
  persist(
    (set) => ({
      sessions: [],

      recordSession: (record) => {
        const entry: PomodoroSessionRecord = { id: nanoid(), ...record };
        set((state) => ({ sessions: [...state.sessions, entry] }));
      },

      clearAll: () => {
        set({ sessions: [] });
      },
    }),
    {
      name: "pomodoro-session-log",
    }
  )
);
