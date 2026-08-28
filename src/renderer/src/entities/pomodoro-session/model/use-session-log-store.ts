import { create } from "zustand";
import { nanoid } from "nanoid";
import type { PomodoroSessionRecord } from "./pomodoro-session.types";

// The session log lives in SQLite (main process), reached over IPC. This store
// is the reactive in-memory cache: reads are synchronous for every subscriber
// (the stats widget and analytics page select the whole array), and every
// mutation is written through to SQLite fire-and-forget. Moving off localStorage
// removes the ~5MB quota that used to cap history and silently drop new sessions
// once the persisted array grew too large.

// Fields with safe defaults: callers may omit them and the defaults backfill
// them.
type DefaultedField =
  | "overtimeSec"
  | "idleSec"
  | "attention"
  | "attentionSource"
  | "sessionEndType"
  | "processBuckets"
  | "cappedAt60m"
  | "intendedMode"
  | "note"
  | "todoIds";

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
  // [] = no todo was on the desk. Same never-backfill rule as intendedMode.
  todoIds: [],
};

type SessionLogState = {
  sessions: PomodoroSessionRecord[];
  // Returns the created record so the caller can read back what it wrote.
  //
  // Its `id` is NOT the todo accrual's `session_id`: the ledger's is minted at
  // work-block start (use-pomodoro-store's startBlock), this one at record
  // time, and the two are never reconciled. The only link between the session
  // log and the todo layer is `todoIds`, the desk union stamped below.
  recordSession: (record: RecordSessionInput) => PomodoroSessionRecord;
  updateSessionNote: (id: string, note: string) => void;
};

export const useSessionLogStore = create<SessionLogState>((set) => ({
  sessions: [],

  recordSession: (record) => {
    const entry: PomodoroSessionRecord = {
      id: nanoid(),
      ...RECORD_DEFAULTS,
      ...record,
    };
    // In-memory first so every subscriber updates immediately; SQLite is the
    // durable record, written through without blocking the UI.
    set((state) => ({ sessions: [...state.sessions, entry] }));
    window.electronAPI?.pomodoro
      ?.record(entry)
      .catch((error) => {
        console.error("pomodoro session log: failed to persist session", error);
      });
    return entry;
  },

  updateSessionNote: (id, note) => {
    const trimmed = note.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, note: next } : s
      ),
    }));
    window.electronAPI?.pomodoro
      ?.updateNote(id, next)
      .catch((error) => {
        console.error("pomodoro session log: failed to persist note", error);
      });
  },
}));

// --- Hydration from SQLite -------------------------------------------------

function mergeById(
  base: PomodoroSessionRecord[],
  extra: PomodoroSessionRecord[]
): PomodoroSessionRecord[] {
  if (extra.length === 0) return base;
  const seen = new Set(base.map((s) => s.id));
  const merged = [...base];
  for (const s of extra) {
    if (!seen.has(s.id)) merged.push(s);
  }
  return merged;
}

async function hydrate(): Promise<void> {
  const api = window.electronAPI?.pomodoro;
  if (!api) return; // No bridge (e.g. a bare renderer) — stays in-memory only.

  try {
    const rows = (await api.list()) as PomodoroSessionRecord[];
    // Merge rather than replace: a session recorded during this async hydrate
    // (its write-through may not have been read back yet) must survive.
    useSessionLogStore.setState((state) => ({
      sessions: mergeById(rows, state.sessions),
    }));
  } catch (error) {
    console.error("pomodoro session log: hydrate from SQLite failed", error);
  }
}

void hydrate();
