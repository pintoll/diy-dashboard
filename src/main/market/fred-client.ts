export type FredSeriesPoint = { date: string; value: number };

export type FredSeriesSnapshot = {
  id: string;
  points: FredSeriesPoint[];
  fetchedAt: string;
};

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

type FredObservation = { date: string; value: string };
type FredResponse = { observations?: FredObservation[]; error_message?: string };

function getApiKey(): string {
  const key = import.meta.env.MAIN_VITE_FRED_API_KEY;
  if (!key) {
    throw new Error("MISSING_FRED_API_KEY");
  }
  return key;
}

export async function fetchSeries(
  seriesId: string,
  options: { limit?: number } = {}
): Promise<FredSeriesSnapshot> {
  const apiKey = getApiKey();
  const limit = options.limit ?? 90;

  const url = new URL(FRED_BASE);
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
