export type SeriesPoint = {
  date: string;
  value: number;
};

export type SeriesSnapshot = {
  id: string;
  points: SeriesPoint[];
  fetchedAt: string;
};

export type EventEntry = {
  id: string;
  date: string;
  label: string;
};

export type EventsSnapshot = {
  id: string;
  events: EventEntry[];
  fetchedAt: string;
};

export type IndicatorUnit = "percent" | "index" | "currency" | "basis_points";

// Renderer-side view of a connector definition. Only the fields the UI reads
// are modelled: how to reach the source is the main process's business, and
// nothing here should tempt a component into caring about transport.
export type ConnectorKind = "series" | "events";

export type IndicatorConnector = {
  id: string;
  kind: ConnectorKind;
  label: string;
  group: string;
  enabled: boolean;
  order?: number;
  display?: { unit: IndicatorUnit; fractionDigits: number };
  meta?: Record<string, string | number | boolean>;
};

// Presentation defaults for a connector whose definition omits `display`.
// Kept here so every consumer formats an unconfigured series identically.
export const DEFAULT_DISPLAY: { unit: IndicatorUnit; fractionDigits: number } = {
  unit: "index",
  fractionDigits: 2,
};

// Per-connector fetch result. The main process settles each source
// independently, so a card can fail on its own while its neighbours render.
export type FetchOutcome<T> =
  | { id: string; ok: true; data: T }
  | { id: string; ok: false; error: string };

// Groups become the widget's tabs. Ordering follows the lowest `order` among a
// group's members, so a connector's `order` positions both it and its tab;
// groups where nobody set one fall back to alphabetical.
export function groupsOf(connectors: IndicatorConnector[]): string[] {
  const lowest = new Map<string, number>();
  for (const connector of connectors) {
    const order = connector.order ?? Number.MAX_SAFE_INTEGER;
    const current = lowest.get(connector.group);
    if (current === undefined || order < current) {
      lowest.set(connector.group, order);
    }
  }
  return [...lowest.entries()]
    .sort((a, b) => (a[1] !== b[1] ? a[1] - b[1] : a[0].localeCompare(b[0])))
    .map(([group]) => group);
}
