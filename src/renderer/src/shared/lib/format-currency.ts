// Currency formatting for money stored as integer minor units. Amounts never
// pass through a float, so the only rounding happens here at the display edge
// and once at parse time.
//
// Pair every rendered figure with the `tabular-nums` class so columns align.

export type CurrencyCode = "KRW" | "USD";

// Minor units per major unit. KRW has no subunit; USD is cents.
export const CURRENCY_SCALE: Record<CurrencyCode, number> = { KRW: 0, USD: 2 };

export const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  KRW: "₩",
  USD: "$",
};

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: CurrencyCode, compact: boolean): Intl.NumberFormat {
  const key = `${currency}:${compact}`;
  const cached = formatters.get(key);
  if (cached) return cached;

  const created = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : CURRENCY_SCALE[currency],
  });
  formatters.set(key, created);
  return created;
}

export function minorToMajor(amount: number, currency: CurrencyCode): number {
  return amount / 10 ** CURRENCY_SCALE[currency];
}

export function majorToMinor(value: number, currency: CurrencyCode): number {
  return Math.round(value * 10 ** CURRENCY_SCALE[currency]);
}

// Renders an amount in its own currency, e.g. 2000 USD -> "$20.00".
export function formatMinor(amount: number, currency: CurrencyCode): string {
  return formatterFor(currency, false).format(minorToMajor(amount, currency));
}

// Renders a KRW won figure, e.g. 42180000 -> "₩42,180,000".
export function formatKrw(won: number): string {
  return formatterFor("KRW", false).format(won);
}

// Shortened KRW for chart axes and other tight spots, e.g. 42180000 -> "₩42.2M".
export function formatKrwCompact(won: number): string {
  return formatterFor("KRW", true).format(won);
}

export function formatSignedKrw(won: number): string {
  const sign = won > 0 ? "+" : "";
  return `${sign}${formatKrw(won)}`;
}

// Parses free text from an amount field into minor units. Returns null when the
// text is not a usable non-negative number, so the caller can hold the form.
export function parseAmountToMinor(
  text: string,
  currency: CurrencyCode
): number | null {
  const cleaned = text.replace(/[,\s]/g, "");
  if (!cleaned) return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;

  return majorToMinor(value, currency);
}

// Inverse of parseAmountToMinor, for seeding an edit form's text field.
export function minorToInputValue(
  amount: number,
  currency: CurrencyCode
): string {
  const major = minorToMajor(amount, currency);
  return CURRENCY_SCALE[currency] === 0
    ? String(major)
    : major.toFixed(CURRENCY_SCALE[currency]);
}
