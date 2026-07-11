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
  getFredKey: () => Promise<string>;
  setFredKey: (key: string) => Promise<void>;
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

// Date-based todos. `date` is the planned day (yyyy-MM-dd, Asia/Seoul) and is
// never mutated by overdue carry-over; `completedOn` is the day it was
// actually finished. `workedSec` is pomodoro time accrued via recordWork.
type TodoSource = "user" | "agent";

interface TodoItem {
  id: string;
  date: string;
  title: string;
  note: string | null;
  done: boolean;
  completedOn: string | null;
  sortOrder: number;
  workedSec: number;
  source: TodoSource;
  createdAt: string;
  updatedAt: string;
}

interface TodoCreateInput {
  title: string;
  date?: string;
  note?: string | null;
}

interface TodoPatch {
  title?: string;
  note?: string | null;
  date?: string;
  done?: boolean;
  sortOrder?: number;
}

interface TodoListFilter {
  date?: string;
  from?: string;
  to?: string;
}

interface TodoRecordWorkInput {
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
  | "work";

interface TodosChangedPayload {
  reason: TodosChangedReason;
  id?: string;
}

interface TodosAPI {
  list: (filter?: TodoListFilter) => Promise<TodoItem[]>;
  overdue: (before?: string) => Promise<TodoItem[]>;
  create: (input: TodoCreateInput) => Promise<TodoItem>;
  update: (id: string, patch: TodoPatch) => Promise<TodoItem>;
  remove: (id: string) => Promise<void>;
  reorder: (date: string, ids: string[]) => Promise<void>;
  active: {
    get: () => Promise<TodoItem | null>;
    set: (id: string | null) => Promise<TodoItem | null>;
  };
  recordWork: (input: TodoRecordWorkInput) => Promise<void>;
  onChanged: (callback: (payload: TodosChangedPayload) => void) => () => void;
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
  todoId: string | null;
  note: string | null;
}

interface PomodoroAPI {
  list: () => Promise<PomodoroSessionDTO[]>;
  record: (session: PomodoroSessionDTO) => Promise<void>;
  updateNote: (id: string, note: string | null) => Promise<void>;
  import: (sessions: PomodoroSessionDTO[]) => Promise<{ imported: number }>;
}

interface ElectronAPI {
  showNotification: (payload: { title: string; body: string }) => Promise<void>;
  isNotificationSupported: () => Promise<boolean>;
  onUpdateStatus: (callback: (payload: UpdateStatusPayload) => void) => () => void;
  checkForUpdates: () => Promise<void>;
  quitAndInstallUpdate: () => Promise<void>;
  getIdleTime: () => Promise<number>;
  flashFrame: () => Promise<void>;
  notifyPomodoroSessionStarted: () => Promise<void>;
  notifyPomodoroSessionEnded: () => Promise<void>;
  onActiveWindow: (callback: (data: ActiveWindowPayload) => void) => () => void;
  getDetectionDiagnostics: () => Promise<DetectionDiagnostics>;
  setTrayTooltip: (text: string | null) => Promise<void>;
  siteGuard: SiteGuardAPI;
  appGuard: AppGuardAPI;
  dailyNews: DailyNewsAPI;
  settings: SettingsAPI;
  pomodoro: PomodoroAPI;
  todos: TodosAPI;
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

interface FredReleaseDateEntry {
  releaseId: number;
  releaseName: string;
  date: string;
}

interface MarketAPI {
  fred: {
    getSeries: (seriesId: string, limit?: number) => Promise<MarketSeriesSnapshot>;
    getMany: (seriesIds: string[], limit?: number) => Promise<MarketSeriesSnapshot[]>;
    getReleaseDates: (
      releaseIds: number[],
      from: string,
      to: string
    ) => Promise<FredReleaseDateEntry[]>;
  };
}

interface Window {
  electronAPI?: ElectronAPI;
  marketAPI?: MarketAPI;
}
