import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { PomodoroSessionRecord } from "./pomodoro-session.types";

const STORE_VERSION = 4;

// Fields with safe defaults: callers may omit them and migrations backfill them.
type DefaultedField =
  | "overtimeSec"
  | "idleSec"
  | "attention"
  | "attentionSource"
  | "sessionEndType"
  | "processBuckets"
  | "cappedAt60m"
  | "intendedMode"
  | "note";

type RecordSessionInput =
  Omit<PomodoroSessionRecord, "id" | DefaultedField>
  & Partial<Pick<PomodoroSessionRecord, DefaultedField>>;

const RECORD_DEFAULTS: Pick<PomodoroSessionRecord, DefaultedField> = {
  overtimeSec: 0,
  idleSec: 0,
  attention: "focus",
  attentionSource: "auto",
  sessionEndType: "completed",
  processBuckets: {},
  cappedAt60m: false,
  // null = intent was never declared. Never backfilled to a real value — a
  // fake intent would pollute the intent/outcome collapse analysis.
  intendedMode: null,
  note: null,
};

type SessionLogState = {
  sessions: PomodoroSessionRecord[];
  recordSession: (record: RecordSessionInput) => void;
  updateSessionNote: (id: string, note: string) => void;
  clearAll: () => void;
};

function migrate(persistedState: unknown, version: number): SessionLogState {
  const state = (persistedState ?? {}) as { sessions?: Partial<PomodoroSessionRecord>[] };
  let sessions = state.sessions ?? [];

  // v0 -> v1: backfill stage-one detection fields.
  if (version < 1) {
    sessions = sessions.map((s) => ({ ...RECORD_DEFAULTS, ...s }));
  }

  // v1 -> v4: the stats and focus-mode branches independently bumped to v2/v3
  // with divergent semantics (mixed-verdict removal, intendedMode, note,
  // sessionEndType). This consolidating step is idempotent and backfills every
  // newer field regardless of which branch's data is on disk: collapse the
  // removed `mixed` verdict to leisure and default the optional fields.
  if (version < 4) {
    sessions = sessions.map((s) => ({
      ...s,
      attention: (s.attention as string) === "mixed" ? "leisure" : (s.attention ?? "focus"),
      intendedMode: s.intendedMode ?? null,
      sessionEndType: s.sessionEndType ?? "completed",
      note: s.note ?? null,
    }));
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

      updateSessionNote: (id, note) => {
        const trimmed = note.trim();
        const next = trimmed.length > 0 ? trimmed : null;
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, note: next } : s
          ),
        }));
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
