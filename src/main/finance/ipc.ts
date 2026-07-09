import { ipcMain } from "electron";
import { getUsdKrwRate, setUsdKrwRate } from "../settings/store";
import {
  archiveAccount,
  createAccount,
  listAccounts,
  updateAccount,
} from "./accounts";
import { createCategory, listCategories } from "./categories";
import {
  confirmCharge,
  createRule,
  deleteRule,
  listRules,
  pendingCharges,
  skipCharge,
  unskipCharge,
  updateRule,
} from "./recurring";
import { monthlySummary, overview, recentMonths } from "./summary";
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from "./transactions";
import { listValuations, upsertValuation } from "./valuations";
import type {
  Account,
  AccountInput,
  Category,
  CategoryInput,
  ConfirmChargeInput,
  FinanceOverview,
  MonthlySummary,
  PendingCharge,
  RecurringRule,
  RecurringRuleInput,
  SkipChargeInput,
  Transaction,
  TransactionFilter,
  TransactionInput,
  Valuation,
  ValuationInput,
} from "./types";

export function registerFinanceIpc(): void {
  ipcMain.handle("finance:accounts:list", (): Account[] => listAccounts());

  ipcMain.handle("finance:accounts:create", (_event, input: AccountInput): number =>
    createAccount(input)
  );

  ipcMain.handle(
    "finance:accounts:update",
    (_event, payload: { id: number; patch: Partial<AccountInput> }): void =>
      updateAccount(payload.id, payload.patch)
  );

  ipcMain.handle("finance:accounts:archive", (_event, id: number): void =>
    archiveAccount(id)
  );

  ipcMain.handle("finance:categories:list", (): Category[] => listCategories());

  ipcMain.handle(
    "finance:categories:create",
    (_event, input: CategoryInput): number => createCategory(input)
  );

  ipcMain.handle(
    "finance:transactions:list",
    (_event, filter?: TransactionFilter): Transaction[] =>
      listTransactions(filter, getUsdKrwRate())
  );

  ipcMain.handle(
    "finance:transactions:create",
    (_event, input: TransactionInput): number => createTransaction(input)
  );

  ipcMain.handle(
    "finance:transactions:update",
    (_event, payload: { id: number; patch: Partial<TransactionInput> }): void =>
      updateTransaction(payload.id, payload.patch)
  );

  ipcMain.handle("finance:transactions:delete", (_event, id: number): void =>
    deleteTransaction(id)
  );

  ipcMain.handle("finance:valuations:list", (_event, accountId: number): Valuation[] =>
    listValuations(accountId)
  );

  ipcMain.handle("finance:valuations:upsert", (_event, input: ValuationInput): void =>
    upsertValuation(input)
  );

  ipcMain.handle("finance:recurring:list", (): RecurringRule[] => listRules());

  ipcMain.handle(
    "finance:recurring:create",
    (_event, input: RecurringRuleInput): number => createRule(input)
  );

  ipcMain.handle(
    "finance:recurring:update",
    (_event, payload: { id: number; patch: Partial<RecurringRuleInput> }): void =>
      updateRule(payload.id, payload.patch)
  );

  ipcMain.handle("finance:recurring:delete", (_event, id: number): void =>
    deleteRule(id)
  );

  ipcMain.handle("finance:recurring:pending", (_event, ym: string): PendingCharge[] =>
    pendingCharges(ym)
  );

  ipcMain.handle(
    "finance:recurring:confirm",
    (_event, input: ConfirmChargeInput): number => confirmCharge(input)
  );

  ipcMain.handle("finance:recurring:skip", (_event, input: SkipChargeInput): void =>
    skipCharge(input)
  );

  ipcMain.handle("finance:recurring:unskip", (_event, input: SkipChargeInput): void =>
    unskipCharge(input)
  );

  ipcMain.handle("finance:summary:monthly", (_event, ym: string): MonthlySummary =>
    monthlySummary(ym, getUsdKrwRate())
  );

  ipcMain.handle(
    "finance:summary:recent",
    (_event, payload: { months: number; endYm?: string }): MonthlySummary[] =>
      recentMonths(payload.months, getUsdKrwRate(), payload.endYm)
  );

  ipcMain.handle("finance:overview", (): FinanceOverview =>
    overview(getUsdKrwRate())
  );

  ipcMain.handle("finance:rate:get", (): number => getUsdKrwRate());

  ipcMain.handle("finance:rate:set", (_event, rate: number): void =>
    setUsdKrwRate(rate)
  );
}
