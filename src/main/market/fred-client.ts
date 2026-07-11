export type FredSeriesPoint = { date: string; value: number };

export type FredSeriesSnapshot = {
  id: string;
  points: FredSeriesPoint[];
  fetchedAt: string;
};

const FRED_OBS_BASE = "https://api.stlouisfed.org/fred/series/observations";
const FRED_RELEASE_DATES_BASE = "https://api.stlouisfed.org/fred/release/dates";

export const FRED_MISSING_API_KEY_ERROR = "MISSING_FRED_API_KEY";

type FredObservation = { date: string; value: string };
type FredResponse = { observations?: FredObservation[]; error_message?: string };

type FredReleaseDate = {
  release_id: number;
  release_name?: string;
  date: string;
};
type FredReleaseDatesResponse = {
  release_dates?: FredReleaseDate[];
  error_message?: string;
};

export type FredReleaseDateEntry = {
  releaseId: number;
  releaseName: string;
  date: string;
};

function getApiKey(): string {
  const key = import.meta.env.MAIN_VITE_FRED_API_KEY;
  if (!key) {
    throw new Error(FRED_MISSING_API_KEY_ERROR);
  }
  return key;
}

const FRED_CONCURRENCY_LIMIT = 5;
const FRED_CACHE_TTL_MS = 5 * 60 * 1000;
const FRED_MAX_RETRIES = 3;
const FRED_BASE_BACKOFF_MS = 1000;

// FRED caps callers at ~120 requests/min. Each widget instance fetches
// independently (macro-indicators = 6 series, economic-calendar = several
// releases), so a dashboard with a few market widgets can otherwise fire dozens
// of requests at once. Gate every FRED HTTP call through a small in-flight
// semaphore so bursts are serialized under the cap.
let fredActiveRequests = 0;
const fredWaiters: Array<() => void> = [];

function acquireFredSlot(): Promise<void> {
  if (fredActiveRequests < FRED_CONCURRENCY_LIMIT) {
    fredActiveRequests += 1;
    return Promise.resolve();
  }
  // At capacity: park until a slot is handed over. The counter is not touched
  // on hand-off (release resolves a waiter instead of decrementing), so the
  // number of in-flight requests never exceeds the limit.
  return new Promise<void>((resolve) => fredWaiters.push(resolve));
}

function releaseFredSlot(): void {
  const next = fredWaiters.shift();
  if (next) {
    next();
  } else {
    fredActiveRequests -= 1;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry only on 429 (rate limited): honor a numeric Retry-After when present,
// otherwise back off exponentially. Every other status falls through unchanged
// to the caller's existing `response.ok` / `error_message` handling.
async function fredFetch(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url);
    if (response.status !== 429 || attempt >= FRED_MAX_RETRIES) {
      return response;
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    const backoffMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : FRED_BASE_BACKOFF_MS * 2 ** attempt;
    await delay(backoffMs);
  }
}

type FredCacheEntry<T> = { value: T; expiresAt: number };

// Short-TTL main-process cache + in-flight coalescing. Multiple widget
// instances (or a dashboard reload) asking for the same series/release within
// the TTL share one network result instead of each spending a request. The
// renderer keeps its own 6h staleness cache; this layer only dedupes the
// near-simultaneous fan-out, so a short TTL never surfaces stale data.
const seriesCache = new Map<string, FredCacheEntry<FredSeriesSnapshot>>();
const seriesInFlight = new Map<string, Promise<FredSeriesSnapshot>>();
const releaseDatesCache = new Map<string, FredCacheEntry<FredReleaseDateEntry[]>>();
const releaseDatesInFlight = new Map<string, Promise<FredReleaseDateEntry[]>>();

async function withFredCache<T>(
  cache: Map<string, FredCacheEntry<T>>,
  inFlight: Map<string, Promise<T>>,
  key: string,
  producer: () => Promise<T>
): Promise<T> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    await acquireFredSlot();
    try {
      const value = await producer();
      cache.set(key, { value, expiresAt: Date.now() + FRED_CACHE_TTL_MS });
      return value;
    } finally {
      releaseFredSlot();
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

export async function fetchSeries(
  seriesId: string,
  options: { limit?: number } = {}
): Promise<FredSeriesSnapshot> {
  const apiKey = getApiKey();
  const limit = options.limit ?? 90;

  return withFredCache(seriesCache, seriesInFlight, `${seriesId}:${limit}`, async () => {
    const url = new URL(FRED_OBS_BASE);
    url.searchParams.set("series_id", seriesId);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("sort_order", "desc");
    url.searchParams.set("limit", String(limit));

    const response = await fredFetch(url.toString());
    if (!response.ok) {
      throw new Error(`FRED request failed (${response.status}) for ${seriesId}`);
    }

    const json = (await response.json()) as FredResponse;
    if (json.error_message) {
      throw new Error(`FRED error for ${seriesId}: ${json.error_message}`);
    }

    const points: FredSeriesPoint[] = (json.observations ?? [])
      .filter((obs) => obs.value !== ".")
      .map((obs) => ({ date: obs.date, value: Number(obs.value) }))
      .filter((p) => Number.isFinite(p.value))
      .reverse();

    return {
      id: seriesId,
      points,
      fetchedAt: new Date().toISOString(),
    };
  });
}

export async function fetchManySeries(
  seriesIds: string[],
  options: { limit?: number } = {}
): Promise<FredSeriesSnapshot[]> {
  return Promise.all(seriesIds.map((id) => fetchSeries(id, options)));
}

async function fetchReleaseDatesForId(
  releaseId: number,
  from: string,
  to: string
): Promise<FredReleaseDateEntry[]> {
  const apiKey = getApiKey();

  return withFredCache(
    releaseDatesCache,
    releaseDatesInFlight,
    `${releaseId}:${from}:${to}`,
    async () => {
      const url = new URL(FRED_RELEASE_DATES_BASE);
      url.searchParams.set("release_id", String(releaseId));
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("file_type", "json");
      url.searchParams.set("realtime_start", from);
      url.searchParams.set("realtime_end", to);
      url.searchParams.set("include_release_dates_with_no_data", "true");
      url.searchParams.set("sort_order", "asc");

      const response = await fredFetch(url.toString());
      if (!response.ok) {
        throw new Error(
          `FRED release/dates ${response.status} for release ${releaseId}`
        );
      }

      const json = (await response.json()) as FredReleaseDatesResponse;
      if (json.error_message) {
        throw new Error(`FRED error for release ${releaseId}: ${json.error_message}`);
      }

      return (json.release_dates ?? []).map((entry) => ({
        releaseId: entry.release_id,
        releaseName: entry.release_name ?? "",
        date: entry.date,
      }));
    }
  );
}

export async function fetchReleaseDates(
  releaseIds: number[],
  from: string,
  to: string
): Promise<FredReleaseDateEntry[]> {
  const results = await Promise.all(
    releaseIds.map((id) => fetchReleaseDatesForId(id, from, to))
  );
  return results.flat();
}
