type UpdateStatusPayload =
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "not-available" }
  | { status: "downloading"; percent: number }
  | { status: "downloaded"; version: string }
  | { status: "error"; message: string };

interface ActiveWindowPayload {
  exeName: string;
  title: string;
}

type DetectionPollOutcome =
  | "ok"
  | "addon_not_loaded"
  | "addon_threw"
  | "no_result"
  | "missing_fields"
  | "empty_exe"
  | "off_primary";

interface DetectionDiagnostics {
  platform: string;
  pollSupported: boolean;
  addonState: "pending" | "loaded" | "unavailable";
  addonError: string | null;
  pollIntervalActive: boolean;
  pollsAttempted: number;
  outcomes: Record<DetectionPollOutcome, number>;
  lastOutcome: DetectionPollOutcome | null;
  lastSentExe: string | null;
  lastSentAt: number | null;
  lastErrorMessage: string | null;
}

type SiteGuardAction = "grant" | "block" | "unblock" | "probe";

interface SiteGuardHistoryEntry {
  at: number;
  action: SiteGuardAction;
  ok: boolean;
  message?: string;
}

interface SiteGuardDiagnostics {
  platform: string;
  supported: boolean;
  hostsPath: string;
  hasWritePermission: boolean | null;
  isBlocked: boolean;
  blockedDomains: string[];
  lastAction: SiteGuardAction | null;
  lastActionAt: number | null;
  lastError: string | null;
  history: SiteGuardHistoryEntry[];
}

interface SiteGuardAPI {
  getStatus: () => Promise<SiteGuardDiagnostics>;
  grantPermission: () => Promise<SiteGuardDiagnostics>;
  block: (domains: string[]) => Promise<SiteGuardDiagnostics>;
  unblock: () => Promise<SiteGuardDiagnostics>;
}

type AppGuardAction = "enforce" | "release" | "kill";

interface AppGuardHistoryEntry {
  at: number;
  action: AppGuardAction;
  ok: boolean;
  message?: string;
}

interface AppGuardDiagnostics {
  platform: string;
  supported: boolean;
  enforcing: boolean;
  blockedExes: string[];
  killCount: number;
  lastKilledExe: string | null;
  lastKilledAt: number | null;
  lastAction: AppGuardAction | null;
  lastActionAt: number | null;
  lastError: string | null;
  history: AppGuardHistoryEntry[];
}

interface AppGuardAPI {
  getStatus: () => Promise<AppGuardDiagnostics>;
  enforce: (exes: string[]) => Promise<AppGuardDiagnostics>;
  release: () => Promise<AppGuardDiagnostics>;
}

type DailyNewsFetchResult = {
  fetchedAt: string;
  items: Array<{
    id: string;
    title: string;
    summary: string;
    url: string;
    source: string;
    category: string;
    publishedAt: string;
    relevanceScore: number;
  }>;
};

type DailyNewsStatus =
  | { phase: "fetching" }
  | { phase: "scoring"; current: number; total: number }
  | { phase: "saving" }
  | { phase: "done"; inserted: number }
  | { phase: "error"; message: string };

interface DailyNewsAPI {
  fetch: () => Promise<DailyNewsFetchResult>;
  sendFeedback: (payload: {
    articleId: number;
    action: "like" | "dislike" | "unlike" | "undislike" | "click";
  }) => Promise<void>;
  onStatus: (callback: (status: DailyNewsStatus) => void) => () => void;
}

interface SettingsAPI {
  getGeminiKey: () => Promise<string>;
  setGeminiKey: (key: string) => Promise<void>;
}

// Finance ledger. Amounts are integers in the minor unit of their own row's
// currency (KRW has none, USD is cents). Anything named `*Krw` has already been
// normalized to won at the manual rate and is only valid for display.
type FinanceCurrency = "KRW" | "USD";
type FinanceAccountKind =
  | "cash"
  | "savings"
  | "investment"
  | "crypto"
  | "liability";
type FinanceTransactionKind = "income" | "expense" | "transfer";
type FinanceCategoryKind = "expense" | "income";

interface FinanceAccount {
  id: number;
  name: string;
  kind: FinanceAccountKind;
  currency: FinanceCurrency;
  openingBalance: number;
  isArchived: boolean;
  sortOrder: number;
}

interface FinanceAccountInput {
  name: string;
  kind: FinanceAccountKind;
  currency: FinanceCurrency;
  openingBalance: number;
  sortOrder?: number;
}

interface FinanceCategory {
  id: number;
  name: string;
  groupName: string;
  kind: FinanceCategoryKind;
  isFixed: boolean;
  sortOrder: number;
}

interface FinanceCategoryInput {
  name: string;
  groupName: string;
  kind: FinanceCategoryKind;
  isFixed: boolean;
}

interface FinanceTransaction {
  id: number;
  kind: FinanceTransactionKind;
  date: string;
  amount: number;
  currency: FinanceCurrency;
  fromAccountId: number | null;
  toAccountId: number | null;
  categoryId: number | null;
  memo: string | null;
  recurringRuleId: number | null;
  amountKrw: number;
  fromAccountName: string | null;
  toAccountName: string | null;
  categoryName: string | null;
}

interface FinanceTransactionInput {
  kind: FinanceTransactionKind;
  date: string;
  amount: number;
  currency: FinanceCurrency;
  fromAccountId?: number | null;
  toAccountId?: number | null;
  categoryId?: number | null;
  memo?: string | null;
  recurringRuleId?: number | null;
}

interface FinanceTransactionFilter {
  ym?: string;
  limit?: number;
}

interface FinanceRecurringRule {
  id: number;
  name: string;
  kind: FinanceTransactionKind;
  amount: number;
  currency: FinanceCurrency;
  variable: boolean;
  billingDay: number;
  categoryId: number | null;
  fromAccountId: number | null;
  toAccountId: number | null;
  startYm: string;
  endYm: string | null;
  active: boolean;
  categoryName: string | null;
}

interface FinanceRecurringRuleInput {
  name: string;
  kind: FinanceTransactionKind;
  amount: number;
  currency: FinanceCurrency;
  variable: boolean;
  billingDay: number;
  categoryId?: number | null;
  fromAccountId?: number | null;
  toAccountId?: number | null;
  startYm: string;
  endYm?: string | null;
  active?: boolean;
}

interface FinancePendingCharge extends FinanceRecurringRule {
  dueDate: string;
}

interface FinanceConfirmChargeInput {
  ruleId: number;
  ym: string;
  amount?: number;
  date?: string;
}

interface FinanceSkipChargeInput {
  ruleId: number;
  ym: string;
}

interface FinanceValuation {
  id: number;
  accountId: number;
  asOfDate: string;
  balance: number;
  currency: FinanceCurrency;
  memo: string | null;
}

interface FinanceValuationInput {
  accountId: number;
  asOfDate: string;
  balance: number;
  currency: FinanceCurrency;
  memo?: string | null;
}

interface FinanceMonthlySummary {
  ym: string;
  income: number;
  spending: number;
  intoAssets: number;
  totalOut: number;
  leftOver: number;
  savingsRate: number;
}

interface FinanceAccountBalance {
  id: number;
  name: string;
  kind: FinanceAccountKind;
  currency: FinanceCurrency;
  balanceKrw: number;
}

interface FinanceAssetSlice {
  kind: FinanceAccountKind;
  total: number;
}

interface FinanceOverview {
  netWorth: number;
  assets: FinanceAssetSlice[];
  liabilities: number;
  balances: FinanceAccountBalance[];
}

interface FinanceAPI {
  accounts: {
    list: () => Promise<FinanceAccount[]>;
    create: (input: FinanceAccountInput) => Promise<number>;
    update: (id: number, patch: Partial<FinanceAccountInput>) => Promise<void>;
    archive: (id: number) => Promise<void>;
  };
  categories: {
    list: () => Promise<FinanceCategory[]>;
    create: (input: FinanceCategoryInput) => Promise<number>;
  };
  transactions: {
    list: (filter?: FinanceTransactionFilter) => Promise<FinanceTransaction[]>;
    create: (input: FinanceTransactionInput) => Promise<number>;
    update: (
      id: number,
      patch: Partial<FinanceTransactionInput>
    ) => Promise<void>;
    remove: (id: number) => Promise<void>;
  };
  valuations: {
    list: (accountId: number) => Promise<FinanceValuation[]>;
    upsert: (input: FinanceValuationInput) => Promise<void>;
  };
  recurring: {
    list: () => Promise<FinanceRecurringRule[]>;
    create: (input: FinanceRecurringRuleInput) => Promise<number>;
    update: (
      id: number,
      patch: Partial<FinanceRecurringRuleInput>
    ) => Promise<void>;
    remove: (id: number) => Promise<void>;
    pending: (ym: string) => Promise<FinancePendingCharge[]>;
    confirm: (input: FinanceConfirmChargeInput) => Promise<number>;
    skip: (input: FinanceSkipChargeInput) => Promise<void>;
    unskip: (input: FinanceSkipChargeInput) => Promise<void>;
  };
  summary: {
    monthly: (ym: string) => Promise<FinanceMonthlySummary>;
    recent: (months: number, endYm?: string) => Promise<FinanceMonthlySummary[]>;
  };
  overview: () => Promise<FinanceOverview>;
  rate: {
    get: () => Promise<number>;
    set: (rate: number) => Promise<void>;
  };
}

// Date-based todos. `date` is the planned day (yyyy-MM-dd; a day runs 05:00
// to 05:00 Asia/Seoul — src/shared/day.ts, never a locally derived calendar
// date) and is never mutated by overdue carry-over; `completedOn` is the day
// it was actually finished. `workedSec` is pomodoro time accrued via
// recordWork.
//
// `date: null` means the todo is in the backlog — wanted, but with no planned
// day (docs/design/todo-backlog.md). Backlog todos appear in no date query,
// including Overdue. The undated bucket is split by `projectId`: filed under a
// project it is that project's backlog (`projects.todos()`), unfiled it is the
// inbox (`todos.inbox()`, the todos page's section).
type TodoSource = "user" | "agent" | "assistant";

interface TodoItem {
  id: string;
  date: string | null;
  title: string;
  note: string | null;
  done: boolean;
  completedOn: string | null;
  sortOrder: number;
  workedSec: number;
  source: TodoSource;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Omitting `date` means today; `date: null` means the backlog. `projectId` is
// never required — capture stays zero-friction and filing is review's job.
interface TodoCreateInput {
  title: string;
  date?: string | null;
  note?: string | null;
  projectId?: string | null;
}

interface TodoPatch {
  title?: string;
  note?: string | null;
  date?: string | null;
  done?: boolean;
  sortOrder?: number;
  projectId?: string | null;
}

interface TodoListFilter {
  date?: string;
  from?: string;
  to?: string;
}

// A day-plan line: a todo penciled onto a clock-time range within one 05:00
// day (docs/design/assistant-behavior.md). `start`/`end` are "HH:MM"; an end
// of "05:00" means end-of-day, and reading order is 05:00-anchored
// (@shared/plan-time), not plain clock order. Overlaps are deliberately not
// validated, and there is no sort field — reordering means retiming.
interface PlanEntryItem {
  id: string;
  day: string;
  todoId: string;
  start: string;
  end: string;
}

// Omitting `day` means today.
interface PlanEntryCreateInput {
  todoId: string;
  day?: string;
  start: string;
  end: string;
}

// Retiming only: pointing an entry at another todo or day is delete+create.
interface PlanEntryPatch {
  start?: string;
  end?: string;
}

interface TodoRecordWorkInput {
  // Stable per in-flight interval (`<sessionId>:<todoId>:<seq>`); the ledger's
  // idempotency key, so a retried accrual can never double-count.
  attributionId: string;
  todoId: string;
  sessionId: string;
  startedAt: number;
  endedAt: number;
  workedSec: number;
}

type TodosChangedReason =
  | "create"
  | "update"
  | "delete"
  | "reorder"
  | "active"
  | "work"
  // A plan entry was written (`id` is the plan entry id, not a todo id).
  | "plan"
  // A day was folded; folds carry no id.
  | "fold"
  // A project or one of its docs was written (`id` is that row's id, not a
  // todo id). A write that also moves todos emits a separate "update" too.
  | "project";

interface TodosChangedPayload {
  reason: TodosChangedReason;
  id?: string;
}

interface TodosAPI {
  list: (filter?: TodoListFilter) => Promise<TodoItem[]>;
  overdue: (before?: string) => Promise<TodoItem[]>;
  // The inbox: undated todos filed under no project. A project's own undated
  // work is read through projects.todos().
  inbox: () => Promise<TodoItem[]>;
  create: (input: TodoCreateInput) => Promise<TodoItem>;
  update: (id: string, patch: TodoPatch) => Promise<TodoItem>;
  remove: (id: string) => Promise<void>;
  // Batch id -> title resolve for display (analytics drill-down). Deleted ids
  // are absent from the result; the caller shows a fallback.
  titlesByIds: (ids: string[]) => Promise<{ id: string; title: string }[]>;
  // `null` reorders the backlog; a date reorders that day.
  reorder: (date: string | null, ids: string[]) => Promise<void>;
  active: {
    get: () => Promise<TodoItem | null>;
    set: (id: string | null) => Promise<TodoItem | null>;
  };
  // The desk: todos currently receiving the running work clock. Multiple
  // members accrue in parallel (docs/design/multi-pomo-todo.md).
  desk: {
    get: () => Promise<TodoItem[]>;
    add: (id: string) => Promise<TodoItem>;
    remove: (id: string) => Promise<void>;
    clear: () => Promise<void>;
  };
  // The day's plan, rendered by the day-sheet widget. `list` defaults to
  // today; entries arrive in lived order (05:00 first, small hours last).
  plan: {
    list: (day?: string) => Promise<PlanEntryItem[]>;
    create: (input: PlanEntryCreateInput) => Promise<PlanEntryItem>;
    update: (id: string, patch: PlanEntryPatch) => Promise<PlanEntryItem>;
    remove: (id: string) => Promise<void>;
  };
  // resolveYesterday(): the last pre-today day with records after the last
  // fold — not the calendar yesterday. `null` = history fully folded.
  yesterday: () => Promise<string | null>;
  // Full-row batch resolve for the plan-entry join; deleted ids are absent.
  byIds: (ids: string[]) => Promise<TodoItem[]>;
  recordWork: (input: TodoRecordWorkInput) => Promise<void>;
  onChanged: (callback: (payload: TodosChangedPayload) => void) => () => void;
}

// The steering layer above the day (docs/design/projects-para.md): PARA folded
// so a project (has an end) and an area (doesn't) share one shape, and
// archiving is a status rather than a second bucket. Projects never execute —
// the only path into doing is pulling one of their backlog todos onto a date,
// which is an ordinary todos.update().
//
// Project writes broadcast through todos.onChanged with reason "project".
type ProjectKind = "project" | "area";
type ProjectStatus = "active" | "someday" | "done" | "archived";

interface ProjectItem {
  id: string;
  kind: ProjectKind;
  title: string;
  // One line: what "done" means. Advisory for areas, which have no end.
  outcome: string | null;
  status: ProjectStatus;
  // A soft marker, never a deadline: nothing notifies off it.
  targetDate: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  // Stamped when status becomes "archived", cleared when it leaves.
  archivedAt: string | null;
}

interface ProjectCreateInput {
  title: string;
  kind?: ProjectKind;
  outcome?: string | null;
  status?: ProjectStatus;
  targetDate?: string | null;
  // Seed body for the default `notes` doc the create mints alongside.
  notes?: string;
}

interface ProjectPatch {
  title?: string;
  kind?: ProjectKind;
  outcome?: string | null;
  status?: ProjectStatus;
  targetDate?: string | null;
  sortOrder?: number;
}

interface ProjectListFilter {
  status?: ProjectStatus;
}

// A project's work in three lists. `backlog` is the undated open work in pull
// order and the only one anything acts on — its head is the next action.
// `scheduled` is context: already pulled onto a day, worked there, never here.
interface ProjectTodos {
  backlog: TodoItem[];
  scheduled: TodoItem[];
  completed: TodoItem[];
}

// Progress and last-activity for every project at once — what the projects
// page's left list needs on first paint.
interface ProjectStatsItem {
  projectId: string;
  total: number;
  done: number;
  // Undated open todos. An active project at zero has no next action, which is
  // what a weekly review looks for.
  openBacklog: number;
  workedSec: number;
  // The last day the project moved: work banked, a todo finished, or a note
  // written. A rename is not movement and does not count.
  lastActivityDay: string | null;
  // The head of the backlog: the one thing that would move this project next,
  // or null when there is nothing pullable.
  nextAction: { id: string; title: string } | null;
  // Deliberately no stale verdict here. It turns on "today", and a dashboard
  // window stays open across the 05:00 boundary, so renderer surfaces compute
  // it themselves against useToday() (@shared/project-stale). The agent API's
  // readers, which have no day of their own, get a server-stamped `isStale` on
  // GET /api/projects/stats instead.
}

// A project's freeform prose — goals, decisions, current state. Every project
// starts with one doc titled "notes".
interface ProjectDocItem {
  id: string;
  projectId: string;
  title: string;
  body: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface ProjectDocCreateInput {
  title: string;
  body?: string;
}

// `body` replaces, `append` adds a line; passing both is rejected.
interface ProjectDocPatch {
  title?: string;
  body?: string;
  append?: string;
}

interface ProjectsAPI {
  list: (filter?: ProjectListFilter) => Promise<ProjectItem[]>;
  create: (input: ProjectCreateInput) => Promise<ProjectItem>;
  update: (id: string, patch: ProjectPatch) => Promise<ProjectItem>;
  // Archiving is the recommended retirement — it keeps the history. Deleting
  // detaches the project's todos (they survive, unfiled) and removes its docs.
  remove: (id: string) => Promise<void>;
  todos: (id: string) => Promise<ProjectTodos>;
  stats: () => Promise<ProjectStatsItem[]>;
  docs: {
    list: (projectId: string) => Promise<ProjectDocItem[]>;
    create: (projectId: string, input: ProjectDocCreateInput) => Promise<ProjectDocItem>;
    update: (id: string, patch: ProjectDocPatch) => Promise<ProjectDocItem>;
    remove: (id: string) => Promise<void>;
  };
}

// The dashboard's scratch memory: one memo per memo-pad widget instance, keyed
// by that instanceId. The renderer owns the live buffer and its undo history
// (@shared/text-history); this API is the durable mirror, which is why a write
// carries the whole `body` next to the single `edit` that produced it.
//
// An edit is a splice — "at `start`, `removed` became `inserted`" — so 100
// undo steps plus 100 redo steps persist without growing with the document.
interface MemoEdit {
  seq: number;
  start: number;
  removed: string;
  inserted: string;
}

interface MemoSnapshotItem {
  id: string;
  body: string;
  createdAt: string;
}

interface MemoStateDTO {
  id: string;
  body: string;
  // seq of the last edit applied to `body`; entries above it are the redo tail.
  cursor: number;
  edits: MemoEdit[];
  snapshots: MemoSnapshotItem[];
  updatedAt: string;
}

// `edit.seq` is the new cursor, so it is not sent twice.
interface MemoCommitEditInput {
  id: string;
  body: string;
  edit: MemoEdit;
}

// Undo/redo: the body and cursor move, but no new edit is recorded.
interface MemoMoveCursorInput {
  id: string;
  body: string;
  cursor: number;
}

interface MemoWriteResult {
  updatedAt: string;
}

// A memo no widget is bound to any more. Carries enough to recognise it by, not
// the body — the list can span every memo ever written.
interface MemoOrphanItem {
  id: string;
  preview: string;
  charCount: number;
  snapshotCount: number;
  updatedAt: string;
}

interface MemoAdoptInput {
  targetId: string;
  sourceId: string;
}

interface MemosAPI {
  // Creates the memo on first sight; there is no separate "new memo" call.
  load: (id: string) => Promise<MemoStateDTO>;
  commitEdit: (input: MemoCommitEditInput) => Promise<MemoWriteResult>;
  moveCursor: (input: MemoMoveCursorInput) => Promise<MemoWriteResult>;
  // Snapshots are never pruned automatically — taking one is deliberate, so
  // losing one should be too.
  snapshot: {
    create: (id: string, body: string) => Promise<MemoSnapshotItem>;
    list: (id: string) => Promise<MemoSnapshotItem[]>;
    remove: (id: string) => Promise<void>;
  };
  // Recovery. A memo is keyed by its widget's instanceId, which only exists in
  // localStorage, so a removed-and-re-added widget cannot reach its old text on
  // its own. The renderer passes the ids still on the dashboard; everything else
  // with content in it is orphaned, and `adopt` moves one onto an empty memo.
  listOrphans: (liveIds: string[]) => Promise<MemoOrphanItem[]>;
  adopt: (input: MemoAdoptInput) => Promise<MemoStateDTO>;
  remove: (id: string) => Promise<void>;
}

// Pomodoro work-session log. Mirrors the renderer's `PomodoroSessionRecord`
// (entities/pomodoro-session) as plain JSON over IPC; the store is the reactive
// in-memory cache and this SQLite-backed API is the durable record.
interface PomodoroSessionDTO {
  id: string;
  phase: "work";
  startedAt: number;
  endedAt: number;
  durationSec: number;
  presetId: string;
  overtimeSec: number;
  idleSec: number;
  intendedMode: "focus" | "leisure" | null;
  attention: "focus" | "leisure";
  attentionSource: "auto" | "user";
  sessionEndType: "completed" | "early-stop";
  processBuckets: Record<string, number>;
  cappedAt60m: boolean;
  todoIds: string[];
  note: string | null;
}

interface PomodoroAPI {
  list: () => Promise<PomodoroSessionDTO[]>;
  record: (session: PomodoroSessionDTO) => Promise<void>;
  updateNote: (id: string, note: string | null) => Promise<void>;
  import: (sessions: PomodoroSessionDTO[]) => Promise<{ imported: number }>;
}

// Renderer-authoritative pomodoro bridge wire types. The raw snapshot carries
// the store's inputs; main recomputes the live fields (remainingSec, overtime
// elapsed) at request time. Kept in sync with src/main/agent-api/pomodoro-bridge.ts.
interface PomodoroRawSnapshot {
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
}

type PomodoroBridgePush =
  | { bound: false }
  | { bound: true; snapshot: PomodoroRawSnapshot };

type PomodoroCommandAction =
  | "start"
  | "pause"
  | "stop"
  | "skip"
  | "reset"
  | "set-preset"
  | "stop-overtime";

interface PomodoroBridgeCommand {
  id: string;
  action: PomodoroCommandAction;
  presetId?: string;
}

interface PomodoroCommandResult {
  id: string;
  applied: boolean;
  reason?: string;
  snapshot: PomodoroRawSnapshot;
}

interface PomodoroBridgeAPI {
  sendSnapshot: (payload: PomodoroBridgePush) => void;
  onCommand: (callback: (command: PomodoroBridgeCommand) => void) => () => void;
  sendCommandResult: (payload: PomodoroCommandResult) => void;
}

interface ElectronAPI {
  showNotification: (payload: { title: string; body: string }) => Promise<void>;
  isNotificationSupported: () => Promise<boolean>;
  onUpdateStatus: (callback: (payload: UpdateStatusPayload) => void) => () => void;
  checkForUpdates: () => Promise<void>;
  quitAndInstallUpdate: () => Promise<void>;
  // Main is holding the quit open while this fires; call `flushComplete` when
  // every debounced write has landed.
  onFlushPendingWrites: (callback: () => void) => () => void;
  flushComplete: () => void;
  getIdleTime: () => Promise<number>;
  flashFrame: () => Promise<void>;
  notifyPomodoroSessionStarted: () => Promise<void>;
  notifyPomodoroSessionEnded: () => Promise<void>;
  onActiveWindow: (callback: (data: ActiveWindowPayload) => void) => () => void;
  pomodoroBridge: PomodoroBridgeAPI;
  getDetectionDiagnostics: () => Promise<DetectionDiagnostics>;
  setTrayTooltip: (text: string | null) => Promise<void>;
  siteGuard: SiteGuardAPI;
  appGuard: AppGuardAPI;
  dailyNews: DailyNewsAPI;
  settings: SettingsAPI;
  pomodoro: PomodoroAPI;
  todos: TodosAPI;
  projects: ProjectsAPI;
  memos: MemosAPI;
  finance: FinanceAPI;
}

interface MarketSeriesPoint {
  date: string;
  value: number;
}

interface MarketSeriesSnapshot {
  id: string;
  points: MarketSeriesPoint[];
  fetchedAt: string;
}

interface MarketEventEntry {
  id: string;
  date: string;
  label: string;
}

interface MarketEventsSnapshot {
  id: string;
  events: MarketEventEntry[];
  fetchedAt: string;
}

// Per-connector result. Fetches settle independently so one failing source
// degrades a single card instead of the whole widget.
type MarketFetchOutcome<T> =
  | { id: string; ok: true; data: T }
  | { id: string; ok: false; error: string };

type ConnectorAuthConfig =
  | { mode: "none" }
  | { mode: "query"; param: string; credential: string }
  | { mode: "bearer"; credential: string }
  | { mode: "header"; header: string; prefix?: string; credential: string };

interface ConnectorDefinition {
  id: string;
  kind: "series" | "events";
  label: string;
  group: string;
  enabled: boolean;
  order?: number;
  request: {
    url: string;
    query?: Record<string, string>;
    headers?: Record<string, string>;
    auth: ConnectorAuthConfig;
  };
  response: {
    itemsPath: string;
    datePath: string;
    valuePath?: string;
    labelPath?: string;
    skipValues?: string[];
  };
  display?: {
    unit: "percent" | "index" | "currency" | "basis_points";
    fractionDigits: number;
  };
  cacheTtlMs?: number;
  meta?: Record<string, string | number | boolean>;
}

interface ConnectorTestResult {
  ok: boolean;
  error?: string;
  itemCount?: number;
  sample?: Array<{ date: string; value?: number; label?: string }>;
}

// Name and host only — secrets never cross back to the renderer.
interface CredentialMeta {
  name: string;
  allowedHost: string;
}

interface MarketAPI {
  connectors: {
    list: () => Promise<ConnectorDefinition[]>;
    upsert: (connector: unknown) => Promise<ConnectorDefinition>;
    patch: (id: string, patch: unknown) => Promise<ConnectorDefinition>;
    remove: (id: string) => Promise<void>;
    test: (connector: unknown) => Promise<ConnectorTestResult>;
    fetchSeries: (
      ids: string[],
      limit: number
    ) => Promise<Array<MarketFetchOutcome<MarketSeriesSnapshot>>>;
    fetchEvents: (
      ids: string[],
      from: string,
      to: string
    ) => Promise<Array<MarketFetchOutcome<MarketEventsSnapshot>>>;
  };
  credentials: {
    list: () => Promise<CredentialMeta[]>;
    set: (
      name: string,
      secret: string,
      allowedHost: string
    ) => Promise<CredentialMeta>;
    remove: (name: string) => Promise<boolean>;
  };
}

interface Window {
  electronAPI?: ElectronAPI;
  marketAPI?: MarketAPI;
}
