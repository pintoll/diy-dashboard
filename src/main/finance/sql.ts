import { CURRENCY_SCALE } from "./types";

// Divisor that turns USD minor units (cents) into major units (dollars).
const USD_MINOR_PER_MAJOR = 10 ** CURRENCY_SCALE.USD;

// Builds a SQL expression normalizing an (amount, currency) column pair to KRW
// won, using the manual rate bound as `@r`. Conversion happens at read time
// rather than being frozen into each row at write time, so correcting the rate
// reflows the entire history at once.
//
// Column names are compile-time literals from this package, never user input.
export function toKrw(amountCol: string, currencyCol: string): string {
  return (
    `CASE ${currencyCol} ` +
    `WHEN 'USD' THEN CAST(ROUND(${amountCol} * @r / ${USD_MINOR_PER_MAJOR}.0) AS INTEGER) ` +
    `ELSE ${amountCol} END`
  );
}

// Builds the `SET a = @a, b = @b` clause for the keys actually present in a
// patch, mapping DTO field names to columns through an explicit allowlist.
export function buildSetClause<T extends object>(
  patch: T,
  columns: Record<keyof T, string>
): { clause: string; params: Record<string, unknown> } {
  const parts: string[] = [];
  const params: Record<string, unknown> = {};

  for (const key of Object.keys(patch) as Array<keyof T>) {
    const column = columns[key];
    const value = patch[key];
    if (!column || value === undefined) continue;
    parts.push(`${column} = @${String(key)}`);
    // better-sqlite3 refuses JS booleans as bound parameters.
    params[String(key)] = typeof value === "boolean" ? (value ? 1 : 0) : value;
  }

  return { clause: parts.join(", "), params };
}
