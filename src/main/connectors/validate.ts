import { ValidationError } from "../todos/types";
import { assertSafeUrl, UnsafeUrlError } from "./url-guard";
import type {
  Connector,
  ConnectorAuth,
  ConnectorRequest,
  EventsResponseMap,
  IndicatorUnit,
  SeriesResponseMap,
} from "./types";

// Hand-written validation rather than a schema library: the repo has no zod,
// and every other boundary here (settings IPC, agent-api routes) validates the
// same way. Messages are written for an agent to act on — they name the field
// and what was expected, because the agent API returns them verbatim as the
// 400 body and that is the only feedback the caller gets.

export const MAX_CONNECTORS = 100;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_STRING = 200;
const MAX_PATH_DEPTH = 8;
const MAX_QUERY_ENTRIES = 20;
const MIN_CACHE_TTL_MS = 1000;
const MAX_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const UNITS: readonly IndicatorUnit[] = [
  "percent",
  "index",
  "currency",
  "basis_points",
];

function fail(message: string): never {
  throw new ValidationError(message);
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

function reqString(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${what} must be a non-empty string`);
  }
  if (value.length > MAX_STRING) {
    fail(`${what} must be at most ${MAX_STRING} characters`);
  }
  return value;
}

// Dot paths address into the JSON response. An empty string is legal and means
// "the root itself" — used when an API returns a bare array.
function dotPath(value: unknown, what: string, allowEmpty: boolean): string {
  if (typeof value !== "string") fail(`${what} must be a string`);
  if (value === "") {
    if (allowEmpty) return value;
    fail(`${what} must not be empty`);
  }
  const segments = value.split(".");
  if (segments.length > MAX_PATH_DEPTH) {
    fail(`${what} must be at most ${MAX_PATH_DEPTH} segments deep`);
  }
  for (const segment of segments) {
    if (segment === "") fail(`${what} has an empty path segment`);
    if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
      fail(`${what} segment "${segment}" must be alphanumeric, "_" or "-"`);
    }
  }
  return value;
}

function stringMap(
  value: unknown,
  what: string
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  const record = asRecord(value, what);
  const entries = Object.entries(record);
  if (entries.length > MAX_QUERY_ENTRIES) {
    fail(`${what} must have at most ${MAX_QUERY_ENTRIES} entries`);
  }
  const out: Record<string, string> = {};
  for (const [key, item] of entries) {
    if (typeof item !== "string") fail(`${what}.${key} must be a string`);
    if (item.length > MAX_STRING) {
      fail(`${what}.${key} must be at most ${MAX_STRING} characters`);
    }
    out[key] = item;
  }
  return out;
}

function validateAuth(value: unknown): ConnectorAuth {
  const auth = asRecord(value, "request.auth");
  const mode = auth.mode;
  switch (mode) {
    case "none":
      return { mode: "none" };
    case "query":
      return {
        mode: "query",
        param: reqString(auth.param, "request.auth.param"),
        credential: reqString(auth.credential, "request.auth.credential"),
      };
    case "bearer":
      return {
        mode: "bearer",
        credential: reqString(auth.credential, "request.auth.credential"),
      };
    case "header":
      return {
        mode: "header",
        header: reqString(auth.header, "request.auth.header"),
        prefix:
          auth.prefix === undefined
            ? undefined
            : reqString(auth.prefix, "request.auth.prefix"),
        credential: reqString(auth.credential, "request.auth.credential"),
      };
    default:
      return fail(
        'request.auth.mode must be one of "none", "query", "bearer", "header"'
      );
  }
}

function validateRequest(value: unknown): ConnectorRequest {
  const request = asRecord(value, "request");
  const url = reqString(request.url, "request.url");
  try {
    assertSafeUrl(url, "request.url");
  } catch (err) {
    // Surface URL policy violations as ordinary validation failures so the
    // agent API maps them to 400 with an actionable message.
    if (err instanceof UnsafeUrlError) fail(err.message);
    throw err;
  }
  return {
    url,
    query: stringMap(request.query, "request.query"),
    headers: stringMap(request.headers, "request.headers"),
    auth: validateAuth(request.auth),
  };
}

function validateSeriesResponse(value: unknown): SeriesResponseMap {
  const response = asRecord(value, "response");
  let skipValues: string[] | undefined;
  if (response.skipValues !== undefined) {
    if (!Array.isArray(response.skipValues)) {
      fail("response.skipValues must be an array of strings");
    }
    skipValues = response.skipValues.map((item, index) =>
      reqString(item, `response.skipValues[${index}]`)
    );
  }
  return {
    itemsPath: dotPath(response.itemsPath, "response.itemsPath", true),
    datePath: dotPath(response.datePath, "response.datePath", false),
    valuePath: dotPath(response.valuePath, "response.valuePath", false),
    skipValues,
  };
}

function validateEventsResponse(value: unknown): EventsResponseMap {
  const response = asRecord(value, "response");
  return {
    itemsPath: dotPath(response.itemsPath, "response.itemsPath", true),
    datePath: dotPath(response.datePath, "response.datePath", false),
    labelPath:
      response.labelPath === undefined
        ? undefined
        : dotPath(response.labelPath, "response.labelPath", false),
  };
}

function validateMeta(
  value: unknown
): Record<string, string | number | boolean> | undefined {
  if (value === undefined) return undefined;
  const record = asRecord(value, "meta");
  const out: Record<string, string | number | boolean> = {};
  for (const [key, item] of Object.entries(record)) {
    if (
      typeof item !== "string" &&
      typeof item !== "number" &&
      typeof item !== "boolean"
    ) {
      fail(`meta.${key} must be a string, number, or boolean`);
    }
    if (typeof item === "number" && !Number.isFinite(item)) {
      fail(`meta.${key} must be a finite number`);
    }
    out[key] = item;
  }
  return out;
}

export function validateConnector(input: unknown): Connector {
  const raw = asRecord(input, "connector");

  const id = reqString(raw.id, "id");
  if (!ID_PATTERN.test(id)) {
    fail(
      'id must start alphanumeric and contain only letters, digits, ".", "_" or "-" (max 64)'
    );
  }

  if (raw.enabled !== undefined && typeof raw.enabled !== "boolean") {
    fail("enabled must be a boolean");
  }
  if (raw.order !== undefined && !Number.isFinite(raw.order)) {
    fail("order must be a finite number");
  }
  if (raw.cacheTtlMs !== undefined) {
    const ttl = raw.cacheTtlMs;
    if (
      typeof ttl !== "number" ||
      !Number.isFinite(ttl) ||
      ttl < MIN_CACHE_TTL_MS ||
      ttl > MAX_CACHE_TTL_MS
    ) {
      fail(
        `cacheTtlMs must be a number between ${MIN_CACHE_TTL_MS} and ${MAX_CACHE_TTL_MS}`
      );
    }
  }

  const base = {
    id,
    label: reqString(raw.label, "label"),
    group: reqString(raw.group, "group"),
    // Defaults to enabled: an agent that just registered a connector means for
    // it to show up, and omitting the field is the common case.
    enabled: raw.enabled === undefined ? true : (raw.enabled as boolean),
    order: raw.order as number | undefined,
    request: validateRequest(raw.request),
    cacheTtlMs: raw.cacheTtlMs as number | undefined,
    meta: validateMeta(raw.meta),
  };

  if (raw.kind === "series") {
    const display = asRecord(raw.display, "display");
    if (!UNITS.includes(display.unit as IndicatorUnit)) {
      fail(`display.unit must be one of ${UNITS.join(", ")}`);
    }
    const digits = display.fractionDigits;
    if (
      typeof digits !== "number" ||
      !Number.isInteger(digits) ||
      digits < 0 ||
      digits > 8
    ) {
      fail("display.fractionDigits must be an integer between 0 and 8");
    }
    return {
      ...base,
      kind: "series",
      response: validateSeriesResponse(raw.response),
      display: { unit: display.unit as IndicatorUnit, fractionDigits: digits },
    };
  }

  if (raw.kind === "events") {
    return {
      ...base,
      kind: "events",
      response: validateEventsResponse(raw.response),
    };
  }

  return fail('kind must be "series" or "events"');
}
