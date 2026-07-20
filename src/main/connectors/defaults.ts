import type { Connector, EventsConnector, IndicatorUnit, SeriesConnector } from "./types";

// Seeded into connectors.json on first run. These reproduce exactly what used
// to be hardcoded in the renderer (macro-indicators' catalog and
// economic-calendar's release list), which is also the proof that the generic
// schema can express a real provider: FRED's missing-value sentinel, string
// numerics, and date-window parameters are all just fields here.

export const FRED_HOST = "api.stlouisfed.org";
export const FRED_CREDENTIAL = "fred";

const OBSERVATIONS_URL = `https://${FRED_HOST}/fred/series/observations`;
const RELEASE_DATES_URL = `https://${FRED_HOST}/fred/release/dates`;

function fredSeries(
  seriesId: string,
  label: string,
  group: string,
  unit: IndicatorUnit,
  fractionDigits: number,
  order: number
): SeriesConnector {
  return {
    id: seriesId,
    kind: "series",
    label,
    group,
    enabled: true,
    order,
    request: {
      url: OBSERVATIONS_URL,
      query: {
        series_id: seriesId,
        file_type: "json",
        // Newest-first so a limit keeps the most recent window; the fetcher
        // sorts back to oldest-first after parsing.
        sort_order: "desc",
        limit: "{{limit}}",
      },
      auth: { mode: "query", param: "api_key", credential: FRED_CREDENTIAL },
    },
    response: {
      itemsPath: "observations",
      datePath: "date",
      valuePath: "value",
      skipValues: ["."],
    },
    display: { unit, fractionDigits },
  };
}

function fredRelease(
  releaseId: number,
  label: string,
  importance: number,
  order: number
): EventsConnector {
  return {
    id: `fred-release-${releaseId}`,
    kind: "events",
    label,
    group: "US",
    enabled: true,
    order,
    request: {
      url: RELEASE_DATES_URL,
      query: {
        release_id: String(releaseId),
        file_type: "json",
        realtime_start: "{{from}}",
        realtime_end: "{{to}}",
        include_release_dates_with_no_data: "true",
        sort_order: "asc",
      },
      auth: { mode: "query", param: "api_key", credential: FRED_CREDENTIAL },
    },
    response: {
      itemsPath: "release_dates",
      datePath: "date",
      labelPath: "release_name",
    },
    // The calendar widget reads these; the transport layer ignores them.
    meta: { country: "US", importance },
  };
}

// Grouped by what the number actually tells you, which is how the widget tabs
// end up reading: policy/term rates, the dollar, and risk appetite.
const SERIES_DEFAULTS: SeriesConnector[] = [
  fredSeries("DGS10", "10Y UST", "Rates", "percent", 2, 10),
  fredSeries("DGS2", "2Y UST", "Rates", "percent", 2, 20),
  fredSeries("DFF", "Fed Funds", "Rates", "percent", 2, 30),
  fredSeries("DTWEXBGS", "DXY", "Dollar", "index", 2, 40),
  fredSeries("DEXKOUS", "USD/KRW", "Dollar", "currency", 1, 50),
  fredSeries("VIXCLS", "VIX", "Risk", "index", 2, 60),
];

// Curated US macro releases. Release IDs come from
// https://fred.stlouisfed.org/releases — the numeric id in a release page URL
// (e.g. /release?rid=10 -> 10).
const EVENT_DEFAULTS: EventsConnector[] = [
  fredRelease(10, "CPI", 3, 10),
  fredRelease(50, "Employment Situation (NFP)", 3, 20),
  fredRelease(46, "GDP", 3, 30),
  fredRelease(82, "Personal Income & Outlays (PCE)", 3, 40),
  fredRelease(151, "Producer Price Index", 2, 50),
  fredRelease(53, "Industrial Production", 2, 60),
];

export const DEFAULT_CONNECTORS: Connector[] = [
  ...SERIES_DEFAULTS,
  ...EVENT_DEFAULTS,
];
