import { create } from "zustand";
import { nanoid } from "nanoid";
import type { PomodoroSessionRecord } from "./pomodoro-session.types";

// The session log lives in SQLite (main process), reached over IPC. This store
// is the reactive in-memory cache: reads are synchronous for every subscriber
// (the stats widget and analytics page select the whole array), and every
// mutation is written through to SQLite fire-and-forget. Moving off localStorage
// removes the ~5MB quota that used to cap history and silently drop new sessions
// once the persisted array grew too large.

// Fields with safe defaults: callers may omit them and the defaults / legacy
// normalization backfill them.
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
  | "todoId";

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
  // null = no todo was active. Same never-backfill rule as intendedMode.
  todoId: null,
};

type SessionLogState = {
  sessions: PomodoroSessionRecord[];
  // Returns the created record so callers can reference its id (the todo
  // accrual links todo_sessions rows by session id).
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
    // In-memory first so the caller gets the id synchronously (the todo accrual
    // needs it) and every subscriber updates immediately; SQLite is the durable
    // record, written through without blocking the UI.
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

// --- One-time localStorage -> SQLite migration + hydration ------------------

const LEGACY_KEY = "pomodoro-session-log";
const MIGRATED_FLAG = "pomodoro-session-log-migrated";

// Normalizes a session array persisted by any earlier store version (v0–v5) to
// the current record shape. This is the old zustand-persist `migrate`, kept only
// for the one-time import of the legacy localStorage blob.
function normalizeLegacySessions(
  persistedState: unknown,
  version: number
): PomodoroSessionRecord[] {
  const state = (persistedState ?? {}) as {
    sessions?: Partial<PomodoroSessionRecord>[];
  };
  let sessions = state.sessions ?? [];

  // v0 -> v1: backfill stage-one detection fields.
  if (version < 1) {
    sessions = sessions.map((s) => ({ ...RECORD_DEFAULTS, ...s }));
  }

  // v1 -> v4: collapse the removed `mixed` verdict to leisure and default the
  // optional fields the stats / focus-mode branches added.
  if (version < 4) {
    sessions = sessions.map((s) => ({
      ...s,
      attention: (s.attention as string) === "mixed" ? "leisure" : (s.attention ?? "focus"),
      intendedMode: s.intendedMode ?? null,
      sessionEndType: s.sessionEndType ?? "completed",
      note: s.note ?? null,
    }));
  }

  // v4 -> v5: sessions gained the active-todo link.
  if (version < 5) {
    sessions = sessions.map((s) => ({ ...s, todoId: s.todoId ?? null }));
  }

  return sessions as PomodoroSessionRecord[];
}

function readLegacySessions(): PomodoroSessionRecord[] | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    // zustand persist stored `{ state: { sessions }, version }`.
    const parsed = JSON.parse(raw) as { state?: unknown; version?: number };
    return normalizeLegacySessions(parsed.state, parsed.version ?? 0);
  } catch (error) {
    console.error("pomodoro session log: could not parse legacy localStorage data", error);
    return null;
  }
}

async function migrateLegacyIfNeeded(api: PomodoroAPI): Promise<void> {
  let alreadyMigrated: string | null;
  try {
    alreadyMigrated = localStorage.getItem(MIGRATED_FLAG);
  } catch {
    return;
  }
  if (alreadyMigrated) return;

  const legacy = readLegacySessions();
  if (legacy === null || legacy.length === 0) {
    // Nothing to migrate (or a missing / corrupt blob) — flag it done so we do
    // not re-attempt on every launch.
    try {
      localStorage.setItem(MIGRATED_FLAG, "1");
    } catch {
      // A blocked localStorage means we just retry next launch; harmless.
    }
    return;
  }

  // Flag only after the import round-trips: an IPC failure should retry next
  // launch rather than lose the history. The legacy blob is left in place as a
  // backup even after a successful import.
  await api.import(legacy);
  try {
    localStorage.setItem(MIGRATED_FLAG, "1");
  } catch {
    // Import succeeded but the flag write failed; the INSERT OR IGNORE import is
    // idempotent, so a retry next launch is a no-op.
  }
}

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

  // A failed legacy import must not stop us loading what is already in SQLite,
  // so the two steps have independent error handling. The import stays unflagged
  // on failure and retries next launch.
  try {
    await migrateLegacyIfNeeded(api);
  } catch (error) {
    console.error("pomodoro session log: legacy migration failed; will retry next launch", error);
  }

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
