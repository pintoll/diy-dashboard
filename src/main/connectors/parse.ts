import type {
  EventEntry,
  EventsConnector,
  SeriesConnector,
  SeriesPoint,
} from "./types";

// Pure response-shaping: dot-path lookup, value coercion, and date
// normalization. Split from fetcher.ts so it carries no Electron or network
// dependency and can be unit tested directly — this is where a wrong connector
// definition actually shows up, so it is the part worth testing.

const MAX_ITEMS = 5000;

export class ConnectorFetchError extends Error {}

export type TemplateVars = {
  limit?: number;
  from?: string;
  to?: string;
};

// {{name}} substitution over query values. An unknown placeholder is an error
// rather than an empty string: silently dropping it would produce a request
// that looks fine and returns the wrong window of data.
export function substitute(value: string, vars: TemplateVars): string {
  return value.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    const replacement = vars[name as keyof TemplateVars];
    if (replacement === undefined) {
      throw new ConnectorFetchError(
        `unknown placeholder {{${name}}} (available: limit, from, to)`
      );
    }
    return String(replacement);
  });
}

export function resolvePath(root: unknown, path: string): unknown {
  if (path === "") return root;
  let current = root;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function describe(value: unknown): string {
  if (value === undefined) return "nothing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") {
    const keys = Object.keys(value as object).slice(0, 5);
    return `an object with keys [${keys.join(", ")}]`;
  }
  return `${typeof value} (${String(value).slice(0, 40)})`;
}

function readItems(json: unknown, itemsPath: string): unknown[] {
  const items = resolvePath(json, itemsPath);
  if (!Array.isArray(items)) {
    const where = itemsPath === "" ? "the response root" : `"${itemsPath}"`;
    throw new ConnectorFetchError(
      `expected an array at ${where}, got ${describe(items)}`
    );
  }
  if (items.length > MAX_ITEMS) {
    throw new ConnectorFetchError(
      `response had ${items.length} items, over the ${MAX_ITEMS} limit`
    );
  }
  return items;
}

// Normalizes the assorted date shapes market APIs use down to YYYY-MM-DD:
// plain dates, ISO datetimes, and epoch seconds/milliseconds.
export function normalizeDate(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Heuristic split point: anything past 1e11 cannot be a plausible
    // second-precision timestamp (it would be year 5138), so it is milliseconds.
    const ms = raw > 1e11 ? raw : raw * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString().slice(0, 10);
}

export function parseSeries(
  connector: SeriesConnector,
  json: unknown
): SeriesPoint[] {
  const { datePath, valuePath, skipValues } = connector.response;
  const items = readItems(json, connector.response.itemsPath);
  const skip = new Set(skipValues ?? []);

  const points: SeriesPoint[] = [];
  for (const item of items) {
    const rawValue = resolvePath(item, valuePath);
    if (rawValue === undefined || rawValue === null) continue;
    if (typeof rawValue === "string" && skip.has(rawValue)) continue;

    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;

    const date = normalizeDate(resolvePath(item, datePath));
    if (date === null) continue;

    points.push({ date, value });
  }

  // A response that parsed to nothing is almost always a wrong path rather than
  // a genuinely empty series, and it is indistinguishable from one downstream —
  // so fail here, where the paths can be named in the message.
  if (points.length === 0) {
    throw new ConnectorFetchError(
      `parsed 0 usable points from ${items.length} items — check datePath "${datePath}" and valuePath "${valuePath}"`
    );
  }

  // Always oldest-first, regardless of the order the API used.
  points.sort((a, b) => a.date.localeCompare(b.date));
  return points;
}

export function parseEvents(
  connector: EventsConnector,
  json: unknown
): EventEntry[] {
  const { datePath, labelPath } = connector.response;
  const items = readItems(json, connector.response.itemsPath);

  const events: EventEntry[] = [];
  for (const item of items) {
    const date = normalizeDate(resolvePath(item, datePath));
    if (date === null) continue;
    const rawLabel = labelPath ? resolvePath(item, labelPath) : undefined;
    const label =
      typeof rawLabel === "string" && rawLabel !== "" ? rawLabel : connector.label;
    events.push({ id: `${connector.id}|${date}`, date, label });
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}
