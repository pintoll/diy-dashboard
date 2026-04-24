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

export async function fetchSeries(
  seriesId: string,
  options: { limit?: number } = {}
): Promise<FredSeriesSnapshot> {
  const apiKey = getApiKey();
  const limit = options.limit ?? 90;

  const url = new URL(FRED_OBS_BASE);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url.toString());
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

  const url = new URL(FRED_RELEASE_DATES_BASE);
  url.searchParams.set("release_id", String(releaseId));
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("realtime_start", from);
  url.searchParams.set("realtime_end", to);
  url.searchParams.set("include_release_dates_with_no_data", "true");
  url.searchParams.set("sort_order", "asc");

  const response = await fetch(url.toString());
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
