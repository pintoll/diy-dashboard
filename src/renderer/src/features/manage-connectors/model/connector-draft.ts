// Flat, all-strings form model. The dialog edits this shape and converts to a
// connector definition on save; keeping the form flat avoids nested-state
// plumbing for what is a handful of fields, and keeping every field a string
// means an in-progress edit is never an invalid number or a half-built object.

export type ConnectorDraft = {
  id: string;
  kind: "series" | "events";
  label: string;
  group: string;
  url: string;
  // Query params as "key=value" lines, which is how they read in an API's own
  // documentation and how an agent would paste them.
  queryText: string;
  authMode: "none" | "query" | "bearer" | "header";
  authParam: string;
  authCredential: string;
  itemsPath: string;
  datePath: string;
  valuePath: string;
  labelPath: string;
  skipValuesText: string;
  unit: string;
  fractionDigits: string;
};

export const EMPTY_DRAFT: ConnectorDraft = {
  id: "",
  kind: "series",
  label: "",
  group: "",
  url: "",
  queryText: "",
  authMode: "none",
  authParam: "api_key",
  authCredential: "",
  itemsPath: "",
  datePath: "date",
  valuePath: "value",
  labelPath: "",
  skipValuesText: "",
  unit: "index",
  fractionDigits: "2",
};

function parseQueryLines(text: string): Record<string, string> {
  const query: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key === "") continue;
    query[key] = trimmed.slice(eq + 1).trim();
  }
  return query;
}

function formatQueryLines(query: Record<string, string> | undefined): string {
  return Object.entries(query ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

export function draftFromConnector(connector: ConnectorDefinition): ConnectorDraft {
  const auth = connector.request.auth;
  return {
    id: connector.id,
    kind: connector.kind,
    label: connector.label,
    group: connector.group,
    url: connector.request.url,
    queryText: formatQueryLines(connector.request.query),
    authMode: auth.mode,
    authParam: auth.mode === "query" ? auth.param : "api_key",
    authCredential: auth.mode === "none" ? "" : auth.credential,
    itemsPath: connector.response.itemsPath,
    datePath: connector.response.datePath,
    valuePath: connector.response.valuePath ?? "value",
    labelPath: connector.response.labelPath ?? "",
    skipValuesText: (connector.response.skipValues ?? []).join(","),
    unit: connector.display?.unit ?? "index",
    fractionDigits: String(connector.display?.fractionDigits ?? 2),
  };
}

// Builds the definition sent to the main process. Deliberately does not
// validate: validation lives in one place (main), and duplicating it here would
// mean two rule sets to keep in step. The form's job is only to assemble a
// well-shaped object and let the real validator reject it.
export function connectorFromDraft(
  draft: ConnectorDraft,
  existing?: ConnectorDefinition
): Record<string, unknown> {
  const auth =
    draft.authMode === "none"
      ? { mode: "none" }
      : draft.authMode === "query"
        ? {
            mode: "query",
            param: draft.authParam.trim(),
            credential: draft.authCredential.trim(),
          }
        : draft.authMode === "bearer"
          ? { mode: "bearer", credential: draft.authCredential.trim() }
          : {
              mode: "header",
              header: draft.authParam.trim(),
              credential: draft.authCredential.trim(),
            };

  const skipValues = draft.skipValuesText
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");

  const response =
    draft.kind === "series"
      ? {
          itemsPath: draft.itemsPath.trim(),
          datePath: draft.datePath.trim(),
          valuePath: draft.valuePath.trim(),
          ...(skipValues.length > 0 ? { skipValues } : {}),
        }
      : {
          itemsPath: draft.itemsPath.trim(),
          datePath: draft.datePath.trim(),
          ...(draft.labelPath.trim() !== ""
            ? { labelPath: draft.labelPath.trim() }
            : {}),
        };

  const base: Record<string, unknown> = {
    id: draft.id.trim(),
    kind: draft.kind,
    label: draft.label.trim(),
    group: draft.group.trim(),
    // Preserve fields the form does not expose (order, cacheTtlMs, meta) so
    // editing a seeded connector in the UI does not quietly strip them.
    enabled: existing?.enabled ?? true,
    ...(existing?.order !== undefined ? { order: existing.order } : {}),
    ...(existing?.cacheTtlMs !== undefined
      ? { cacheTtlMs: existing.cacheTtlMs }
      : {}),
    ...(existing?.meta !== undefined ? { meta: existing.meta } : {}),
    request: {
      url: draft.url.trim(),
      query: parseQueryLines(draft.queryText),
      auth,
    },
    response,
  };

  if (draft.kind === "series") {
    base.display = {
      unit: draft.unit,
      fractionDigits: Number(draft.fractionDigits) || 0,
    };
  }
  return base;
}
