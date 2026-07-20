import { executeConnector } from "./fetcher";
import {
  ConnectorFetchError,
  parseEvents,
  parseSeries,
  type TemplateVars,
} from "./parse";
import { requireConnector } from "./store";
import { validateConnector } from "./validate";
import type {
  Connector,
  EventsSnapshot,
  FetchOutcome,
  SeriesSnapshot,
} from "./types";

// Caching, concurrency limiting, and per-connector error isolation around
// fetcher.ts. Generalizes what fred-client.ts did for one provider: the
// semaphore is now per-host (one slow API must not starve the others) and the
// TTL is per-connector.

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const PER_HOST_CONCURRENCY = 5;

type HostGate = { active: number; waiters: Array<() => void> };

const gates = new Map<string, HostGate>();

function gateFor(host: string): HostGate {
  let gate = gates.get(host);
  if (!gate) {
    gate = { active: 0, waiters: [] };
    gates.set(host, gate);
  }
  return gate;
}

function acquire(host: string): Promise<void> {
  const gate = gateFor(host);
  if (gate.active < PER_HOST_CONCURRENCY) {
    gate.active += 1;
    return Promise.resolve();
  }
  // At capacity: park until a slot is handed over. The counter is untouched on
  // hand-off (release resolves a waiter instead of decrementing), so in-flight
  // requests never exceed the limit.
  return new Promise<void>((resolve) => gate.waiters.push(resolve));
}

function release(host: string): void {
  const gate = gateFor(host);
  const next = gate.waiters.shift();
  if (next) {
    next();
  } else {
    gate.active -= 1;
  }
}

type CacheEntry = { value: unknown; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

// The key includes the parts of the definition that affect the response, so
// editing a connector's URL or paths invalidates its cached result instead of
// serving data fetched under the old definition.
function cacheKey(connector: Connector, vars: TemplateVars): string {
  return JSON.stringify([
    connector.id,
    connector.request,
    connector.response,
    vars,
  ]);
}

function hostOf(connector: Connector): string {
  try {
    return new URL(connector.request.url).hostname;
  } catch {
    return "invalid";
  }
}

async function fetchJson(
  connector: Connector,
  vars: TemplateVars
): Promise<unknown> {
  const key = cacheKey(connector, vars);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const ttl = connector.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const host = hostOf(connector);
  const promise = (async () => {
    await acquire(host);
    try {
      const value = await executeConnector(connector, vars);
      cache.set(key, { value, expiresAt: Date.now() + ttl });
      return value;
    } finally {
      release(host);
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Every connector settles independently. One broken definition (or one API
// having an outage) degrades a single card rather than blanking the widget,
// which is what the previous Promise.all over FRED series did.
async function settleAll<T>(
  ids: string[],
  run: (connector: Connector) => Promise<T>
): Promise<Array<FetchOutcome<T>>> {
  return Promise.all(
    ids.map(async (id): Promise<FetchOutcome<T>> => {
      try {
        const connector = requireConnector(id);
        return { id, ok: true, data: await run(connector) };
      } catch (err) {
        return { id, ok: false, error: errorMessage(err) };
      }
    })
  );
}

function expectKind<K extends Connector["kind"]>(
  connector: Connector,
  kind: K
): Extract<Connector, { kind: K }> {
  if (connector.kind !== kind) {
    throw new ConnectorFetchError(
      `connector "${connector.id}" is kind "${connector.kind}", expected "${kind}"`
    );
  }
  return connector as Extract<Connector, { kind: K }>;
}

export async function fetchSeries(
  ids: string[],
  limit: number
): Promise<Array<FetchOutcome<SeriesSnapshot>>> {
  return settleAll(ids, async (connector) => {
    const series = expectKind(connector, "series");
    const json = await fetchJson(series, { limit });
    return {
      id: series.id,
      points: parseSeries(series, json),
      fetchedAt: new Date().toISOString(),
    };
  });
}

export async function fetchEvents(
  ids: string[],
  from: string,
  to: string
): Promise<Array<FetchOutcome<EventsSnapshot>>> {
  return settleAll(ids, async (connector) => {
    const events = expectKind(connector, "events");
    const json = await fetchJson(events, { from, to });
    return {
      id: events.id,
      events: parseEvents(events, json),
      fetchedAt: new Date().toISOString(),
    };
  });
}

export type ConnectorTestResult = {
  ok: boolean;
  error?: string;
  itemCount?: number;
  sample?: Array<{ date: string; value?: number; label?: string }>;
};

// Runs a definition end-to-end without storing it. This is what makes it safe
// to let an agent author connectors: a wrong path fails loudly here instead of
// becoming a card that silently renders "—".
export async function testConnector(input: unknown): Promise<ConnectorTestResult> {
  let connector: Connector;
  try {
    connector = validateConnector(input);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  try {
    // Bypass the cache so a test always reflects the definition under test.
    const vars: TemplateVars =
      connector.kind === "series"
        ? { limit: 10 }
        : { from: isoDaysFromNow(-30), to: isoDaysFromNow(30) };
    const json = await executeConnector(connector, vars);

    if (connector.kind === "series") {
      const points = parseSeries(connector, json);
      return {
        ok: true,
        itemCount: points.length,
        sample: points.slice(-3),
      };
    }

    const events = parseEvents(connector, json);
    return {
      ok: true,
      itemCount: events.length,
      sample: events.slice(0, 3).map((e) => ({ date: e.date, label: e.label })),
    };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
