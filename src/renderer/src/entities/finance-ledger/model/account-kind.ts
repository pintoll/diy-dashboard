import type {
  AccountKind,
  AssetSlice,
  TransactionKind,
} from "./finance-ledger.types";

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  cash: "Cash",
  savings: "Savings",
  investment: "Investment",
  crypto: "Crypto",
  liability: "Debt",
};

// Asset kinds only, in the order they appear in the distribution bar and donut.
// Liability is excluded: it is subtracted from net worth, not a slice of it.
export const ASSET_KIND_ORDER: AccountKind[] = [
  "cash",
  "savings",
  "investment",
  "crypto",
];

// Defined in globals.css, snapped into the dark-mode lightness band and checked
// for CVD separation against the card surface. Not the raw --chart-* hues.
export const ACCOUNT_KIND_COLOR: Record<AccountKind, string> = {
  cash: "var(--finance-cash)",
  savings: "var(--finance-savings)",
  investment: "var(--finance-investment)",
  crypto: "var(--finance-crypto)",
  liability: "var(--finance-debt)",
};

// Money that leaves the ledger versus money that only changes address. Orange
// left your net worth; green and blue are still yours.
export const FLOW_COLOR = {
  income: "var(--flow-income)",
  spending: "var(--flow-spending)",
  intoAssets: "var(--flow-into-assets)",
  leftOver: "var(--flow-left-over)",
} as const;

export const TRANSACTION_KIND_LABEL: Record<TransactionKind, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
};

// Transfers into these kinds are "Into Assets" rather than spending. Debt
// paydown belongs here because it preserves net worth exactly as saving does.
const ASSET_SINK_KINDS: ReadonlySet<AccountKind> = new Set<AccountKind>([
  "savings",
  "investment",
  "crypto",
  "liability",
]);

export function isAssetSink(kind: AccountKind): boolean {
  return ASSET_SINK_KINDS.has(kind);
}

// Emits the slices in a fixed order so a kind never changes color or position
// when its balance drops to zero and later reappears.
export function orderedAssets(assets: AssetSlice[]): AssetSlice[] {
  const byKind = new Map(assets.map((slice) => [slice.kind, slice.total]));
  return ASSET_KIND_ORDER.map((kind) => ({
    kind,
    total: byKind.get(kind) ?? 0,
  })).filter((slice) => slice.total > 0);
}
