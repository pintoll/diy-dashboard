import { create } from "zustand";
import { currentYm } from "./month";
import {
  ledgerErrorMessage,
  NO_BRIDGE_MESSAGE,
  type Account,
  type Category,
  type LedgerApi,
  type MonthlySummary,
  type Overview,
  type PendingCharge,
  type RecurringRule,
  type Transaction,
} from "./finance-ledger.types";

// How many months the flow trend chart looks back, inclusive of the selected one.
export const TREND_MONTHS = 6;

type Status = "idle" | "loading" | "ready" | "error";

type MonthSlice = {
  transactions: Transaction[];
  summary: MonthlySummary | null;
  pending: PendingCharge[];
  trend: MonthlySummary[];
};

type FinanceStore = MonthSlice & {
  accounts: Account[];
  categories: Category[];
  rules: RecurringRule[];
  overview: Overview | null;
  rate: number;

  ym: string;
  status: Status;
  error: string | null;

  ensureLoaded: () => Promise<void>;
  refresh: () => Promise<void>;
  setYm: (ym: string) => Promise<void>;
};

async function fetchMonth(api: LedgerApi, ym: string): Promise<MonthSlice> {
  const [transactions, summary, pending, trend] = await Promise.all([
    api.transactions.list({ ym }),
    api.summary.monthly(ym),
    api.recurring.pending(ym),
    api.summary.recent(TREND_MONTHS, ym),
  ]);
  return { transactions, summary, pending, trend };
}

// The ledger lives in SQLite, so this store is a read-through cache and nothing
// more. It is deliberately not persisted: a localStorage copy would diverge
// from the database and would render stale before the first IPC read returned.
//
// Mutations live in the `manage-*` features. Each one calls `refresh()` on
// success. Writing a transaction moves account balances, net worth, the month
// summary, the transaction list and the pending queue all at once, so refetching
// everything is both correct and cheap at personal-ledger scale.
export const useFinanceStore = create<FinanceStore>((set, get) => ({
  accounts: [],
  categories: [],
  rules: [],
  overview: null,
  rate: 0,

  transactions: [],
  summary: null,
  pending: [],
  trend: [],

  ym: currentYm(),
  status: "idle",
  error: null,

  ensureLoaded: async () => {
    if (get().status !== "idle") return;
    await get().refresh();
  },

  refresh: async () => {
    const api = window.electronAPI?.finance;
    if (!api) {
      set({ status: "error", error: NO_BRIDGE_MESSAGE });
      return;
    }

    set({ status: "loading", error: null });
    try {
      const ym = get().ym;
      const [accounts, categories, rules, overview, rate] = await Promise.all([
        api.accounts.list(),
        api.categories.list(),
        api.recurring.list(),
        api.overview(),
        api.rate.get(),
      ]);
      const month = await fetchMonth(api, ym);

      set({
        accounts,
        categories,
        rules,
        overview,
        rate,
        ...month,
        status: "ready",
        error: null,
      });
    } catch (error) {
      set({ status: "error", error: ledgerErrorMessage(error) });
    }
  },

  setYm: async (ym: string) => {
    const api = window.electronAPI?.finance;
    if (!api) {
      set({ ym, status: "error", error: NO_BRIDGE_MESSAGE });
      return;
    }

    set({ ym, error: null });
    try {
      set(await fetchMonth(api, ym));
    } catch (error) {
      set({ status: "error", error: ledgerErrorMessage(error) });
    }
  },
}));
