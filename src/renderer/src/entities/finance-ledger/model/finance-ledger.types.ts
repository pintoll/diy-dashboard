// The renderer-side names for the finance domain. These alias the ambient
// interfaces declared in `src/preload/electron-env.d.ts`, which is the IPC
// contract with the main process. Aliasing rather than re-declaring keeps a
// single definition of each shape: a change to the contract fails the build
// here instead of drifting silently.
//
// The ambient file has no imports or exports, so it cannot be imported; its
// types are simply in scope because the renderer tsconfig includes it.

export type Currency = FinanceCurrency;
export type AccountKind = FinanceAccountKind;
export type TransactionKind = FinanceTransactionKind;
export type CategoryKind = FinanceCategoryKind;

export type Account = FinanceAccount;
export type AccountInput = FinanceAccountInput;
export type AccountBalance = FinanceAccountBalance;

export type Category = FinanceCategory;
export type CategoryInput = FinanceCategoryInput;

export type Transaction = FinanceTransaction;
export type TransactionInput = FinanceTransactionInput;
export type TransactionFilter = FinanceTransactionFilter;

export type RecurringRule = FinanceRecurringRule;
export type RecurringRuleInput = FinanceRecurringRuleInput;
export type PendingCharge = FinancePendingCharge;
export type ConfirmChargeInput = FinanceConfirmChargeInput;
export type SkipChargeInput = FinanceSkipChargeInput;

export type Valuation = FinanceValuation;
export type ValuationInput = FinanceValuationInput;

export type MonthlySummary = FinanceMonthlySummary;
export type AssetSlice = FinanceAssetSlice;
export type Overview = FinanceOverview;

export type LedgerApi = FinanceAPI;

export const NO_BRIDGE_MESSAGE = "Finance is only available in the desktop app";

// Every call site guards, because `window.electronAPI` is optional: the renderer
// also boots in a plain browser during `electron-vite dev`.
export function requireLedgerApi(): LedgerApi {
  const api = window.electronAPI?.finance;
  if (!api) throw new Error(NO_BRIDGE_MESSAGE);
  return api;
}

// An IPC rejection arrives as "Error invoking remote method 'x': Error: <real>".
// Surface only the part the main process actually wrote.
export function ledgerErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const marker = raw.lastIndexOf("Error: ");
  return marker >= 0 ? raw.slice(marker + "Error: ".length) : raw;
}
