import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { PomodoroSessionRecord } from "./pomodoro-session.types";

const STORE_VERSION = 3;

type DefaultedFields =
  | "overtimeSec"
  | "idleSec"
  | "attention"
  | "attentionSource"
  | "sessionEndType"
  | "processBuckets"
  | "cappedAt60m"
  | "intendedMode";

type RecordSessionInput =
  Omit<PomodoroSessionRecord, "id" | DefaultedFields>
  & Partial<Pick<PomodoroSessionRecord, DefaultedFields>>;

const RECORD_DEFAULTS: Pick<PomodoroSessionRecord, DefaultedFields> = {
  overtimeSec: 0,
  idleSec: 0,
  attention: "focus",
  attentionSource: "auto",
  sessionEndType: "completed",
  processBuckets: {},
  cappedAt60m: false,
  intendedMode: null,
};

type SessionLogState = {
  sessions: PomodoroSessionRecord[];
  recordSession: (record: RecordSessionInput) => void;
  clearAll: () => void;
};

function migrate(persistedState: unknown, version: number): SessionLogState {
  const state = (persistedState ?? {}) as { sessions?: Partial<PomodoroSessionRecord>[] };
  let sessions = state.sessions ?? [];

  if (version < 1) {
    sessions = sessions.map((s) => ({ ...RECORD_DEFAULTS, ...s }));
  }

  // v2 adds intendedMode. Legacy records are never backfilled — null marks an
  // undeclared intent and is excluded from the intent-vs-outcome 2x2.
  if (version < 2) {
    sessions = sessions.map((s) => ({ ...s, intendedMode: s.intendedMode ?? null }));
  }

  // v3 adds sessionEndType. Legacy records store no remaining-time info, so they
  // cannot be reclassified — default them to "completed".
  if (version < 3) {
    sessions = sessions.map((s) => ({ ...s, sessionEndType: s.sessionEndType ?? "completed" }));
  }

  return { ...(state as object), sessions: sessions as PomodoroSessionRecord[] } as SessionLogState;
}

export const useSessionLogStore = create<SessionLogState>()(
  persist(
    (set) => ({
      sessions: [],

      recordSession: (record) => {
        const entry: PomodoroSessionRecord = {
          id: nanoid(),
          ...RECORD_DEFAULTS,
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
