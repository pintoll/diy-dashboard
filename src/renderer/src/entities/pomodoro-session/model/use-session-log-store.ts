import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { PomodoroSessionRecord } from "./pomodoro-session.types";

const STORE_VERSION = 1;

type StageOneFields =
  | "overtimeSec"
  | "idleSec"
  | "attention"
  | "attentionSource"
  | "processBuckets"
  | "cappedAt60m";

type RecordSessionInput =
  Omit<PomodoroSessionRecord, "id" | StageOneFields>
  & Partial<Pick<PomodoroSessionRecord, StageOneFields>>;

type SessionLogState = {
  sessions: PomodoroSessionRecord[];
  recordSession: (record: RecordSessionInput) => void;
  clearAll: () => void;
};

function migrate(persistedState: unknown, version: number): SessionLogState {
  const state = (persistedState ?? {}) as { sessions?: Partial<PomodoroSessionRecord>[] };
  if (version < 1) {
    const sessions: PomodoroSessionRecord[] = (state.sessions ?? []).map((s) => ({
      ...s,
      overtimeSec: s.overtimeSec ?? 0,
      idleSec: s.idleSec ?? 0,
      attention: s.attention ?? "focus",
      attentionSource: s.attentionSource ?? "auto",
      processBuckets: s.processBuckets ?? {},
      cappedAt60m: s.cappedAt60m ?? false,
    })) as PomodoroSessionRecord[];
    return { ...(state as object), sessions } as SessionLogState;
  }
  return persistedState as SessionLogState;
}

export const useSessionLogStore = create<SessionLogState>()(
  persist(
    (set) => ({
      sessions: [],

      recordSession: (record) => {
        const entry: PomodoroSessionRecord = {
          id: nanoid(),
          overtimeSec: 0,
          idleSec: 0,
          attention: "focus",
          attentionSource: "auto",
          processBuckets: {},
          cappedAt60m: false,
          ...record,
        };
        set((state) => ({ sessions: [...state.sessions, entry] }));
      },

      clearAll: () => {
        set({ sessions: [] });
      },
    }),
    {
      name: "pomodoro-session-log",
      version: STORE_VERSION,
      migrate,
    }
  )
);
