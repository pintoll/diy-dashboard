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

const STAGE_ONE_DEFAULTS: Pick<PomodoroSessionRecord, StageOneFields> = {
  overtimeSec: 0,
  idleSec: 0,
  attention: "focus",
  attentionSource: "auto",
  processBuckets: {},
  cappedAt60m: false,
};

type SessionLogState = {
  sessions: PomodoroSessionRecord[];
  recordSession: (record: RecordSessionInput) => void;
  clearAll: () => void;
};

function migrate(persistedState: unknown, version: number): SessionLogState {
  const state = (persistedState ?? {}) as { sessions?: Partial<PomodoroSessionRecord>[] };
  if (version < 1) {
    const sessions: PomodoroSessionRecord[] = (state.sessions ?? []).map((s) => ({
      ...STAGE_ONE_DEFAULTS,
      ...s,
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
          ...STAGE_ONE_DEFAULTS,
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
