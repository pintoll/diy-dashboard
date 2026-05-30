import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { PomodoroSessionRecord } from "./pomodoro-session.types";

const STORE_VERSION = 2;

// Fields with safe defaults: callers may omit them and migrations backfill them.
type DefaultedField =
  | "overtimeSec"
  | "idleSec"
  | "attention"
  | "attentionSource"
  | "processBuckets"
  | "cappedAt60m"
  | "intendedMode";

type RecordSessionInput =
  Omit<PomodoroSessionRecord, "id" | DefaultedField>
  & Partial<Pick<PomodoroSessionRecord, DefaultedField>>;

const RECORD_DEFAULTS: Pick<PomodoroSessionRecord, DefaultedField> = {
  overtimeSec: 0,
  idleSec: 0,
  attention: "focus",
  attentionSource: "auto",
  processBuckets: {},
  cappedAt60m: false,
  // null = intent was never declared. Never backfilled to a real value — a
  // fake intent would pollute the intent/outcome collapse analysis.
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

  // v0 -> v1: backfill stage-one detection fields.
  if (version < 1) {
    sessions = sessions.map((s) => ({ ...RECORD_DEFAULTS, ...s }));
  }

  // v1 -> v2: `mixed` verdict removed (buckets as leisure); add intendedMode.
  if (version < 2) {
    sessions = sessions.map((s) => ({
      ...s,
      attention: (s.attention as string) === "mixed" ? "leisure" : s.attention,
      intendedMode: s.intendedMode ?? null,
    }));
  }

  return { ...(state as object), sessions } as SessionLogState;
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
