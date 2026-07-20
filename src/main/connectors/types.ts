// Declarative data-source definitions. A connector describes *how* to reach an
// HTTP JSON endpoint and *where* in the response the values live, so adding a
// new indicator is a config edit rather than a code change. Definitions are
// stored in plaintext (connectors.json) and are written mostly by an agent over
// the agent API; secrets never appear here, only a `credential` name that the
// fetcher resolves against the encrypted credential store.

export type IndicatorUnit = "percent" | "index" | "currency" | "basis_points";

export type ConnectorAuth =
  | { mode: "none" }
  | { mode: "query"; param: string; credential: string }
  | { mode: "bearer"; credential: string }
  | { mode: "header"; header: string; prefix?: string; credential: string };

export type ConnectorRequest = {
  url: string;
  // Values may contain {{limit}} / {{from}} / {{to}} placeholders, substituted
  // per request. Keys and non-placeholder text are used verbatim.
  query?: Record<string, string>;
  headers?: Record<string, string>;
  auth: ConnectorAuth;
};

// Dot paths only ("observations", "data.items", "" for a root-level array).
// No wildcards, filters, or expressions: the point is that an agent can write
// one correctly from an API sample without learning a query language.
export type SeriesResponseMap = {
  itemsPath: string;
  datePath: string;
  valuePath: string;
  // Sentinels the API uses for "no observation" (FRED sends "."). Matched
  // against the raw value before numeric coercion.
  skipValues?: string[];
};
// Note: there is no "order" field. Points are always sorted oldest-first by
// their parsed date, so an API returning newest-first needs no declaration.
// (Query params like FRED's sort_order still belong in request.query, where
// they select *which* rows a limit returns.)

export type EventsResponseMap = {
  itemsPath: string;
  datePath: string;
  labelPath?: string;
};

type ConnectorBase = {
  id: string;
  label: string;
  // Drives the widget's tab grouping. Free-form; tabs are derived from the
  // distinct values present, so a new group needs no code change.
  group: string;
  enabled: boolean;
  order?: number;
  request: ConnectorRequest;
  cacheTtlMs?: number;
  // Escape hatch for widget-domain values the transport layer has no opinion
  // about (calendar country/importance, etc). Kept scalar-only so the file
  // stays reviewable and diffable.
  meta?: Record<string, string | number | boolean>;
};

export type SeriesConnector = ConnectorBase & {
  kind: "series";
  response: SeriesResponseMap;
  display: { unit: IndicatorUnit; fractionDigits: number };
};

export type EventsConnector = ConnectorBase & {
  kind: "events";
  response: EventsResponseMap;
};

export type Connector = SeriesConnector | EventsConnector;

export type ConnectorsFile = {
  version: number;
  connectors: Connector[];
};

export const CONNECTORS_FILE_VERSION = 1;

// Fetch results. These mirror the renderer's SeriesPoint/SeriesSnapshot shapes
// structurally; the renderer keeps its own declarations so it never imports
// from the main process.
export type SeriesPoint = { date: string; value: number };

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

// Per-connector outcome. Fetches are settled independently so one broken
// connector degrades a single card instead of blanking the whole widget.
export type FetchOutcome<T> =
  | { id: string; ok: true; data: T }
  | { id: string; ok: false; error: string };

// What a credential exposes outside the credential module. The secret itself
// never appears in a type that crosses IPC or the agent API; `allowedHost` binds
// it to one host so a tampered or mistaken connector definition cannot redirect
// it elsewhere.
export type CredentialMeta = {
  name: string;
  allowedHost: string;
};
