import type { Country, Importance } from "@/src/entities/calendar-event";

export type ReleaseMeta = {
  releaseId: number;
  displayName: string;
  // Expected release_name from FRED — used to detect drift.
  expectedFredName?: string;
  country: Country;
  importance: Importance;
};

// Curated US macro releases. Release IDs sourced from
// https://fred.stlouisfed.org/releases. To add: look up the release page and
// copy the numeric id from the URL (e.g. /release?rid=10 → releaseId: 10).
export const RELEASES_CATALOG: readonly ReleaseMeta[] = [
  {
    releaseId: 10,
    displayName: "CPI",
    expectedFredName: "Consumer Price Index",
    country: "US",
    importance: 3,
  },
  {
    releaseId: 50,
    displayName: "Employment Situation (NFP)",
    expectedFredName: "Employment Situation",
    country: "US",
    importance: 3,
  },
  {
    releaseId: 46,
    displayName: "GDP",
    expectedFredName: "Gross Domestic Product",
    country: "US",
    importance: 3,
  },
  {
    releaseId: 82,
    displayName: "Personal Income & Outlays (PCE)",
    expectedFredName: "Personal Income and Outlays",
    country: "US",
    importance: 3,
  },
  {
    releaseId: 151,
    displayName: "Producer Price Index",
    expectedFredName: "Producer Price Index",
    country: "US",
    importance: 2,
  },
  {
    releaseId: 53,
    displayName: "Industrial Production",
    expectedFredName: "Industrial Production and Capacity Utilization",
    country: "US",
    importance: 2,
  },
];

export const RELEASE_IDS: readonly number[] = RELEASES_CATALOG.map(
  (r) => r.releaseId
);

export const RELEASE_META_BY_ID: Readonly<Record<number, ReleaseMeta>> =
  Object.fromEntries(RELEASES_CATALOG.map((r) => [r.releaseId, r]));
