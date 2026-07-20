import { describe, expect, it } from "vitest";
import {
  ConnectorFetchError,
  normalizeDate,
  parseEvents,
  parseSeries,
  resolvePath,
  substitute,
} from "./parse";
import type { EventsConnector, SeriesConnector } from "./types";

function series(response: Partial<SeriesConnector["response"]>): SeriesConnector {
  return {
    id: "TEST",
    kind: "series",
    label: "Test",
    group: "Test",
    enabled: true,
    request: { url: "https://example.com/x", auth: { mode: "none" } },
    response: {
      itemsPath: "",
      datePath: "date",
      valuePath: "value",
      ...response,
    },
    display: { unit: "index", fractionDigits: 2 },
  };
}

function events(response: Partial<EventsConnector["response"]>): EventsConnector {
  return {
    id: "CAL",
    kind: "events",
    label: "Fallback Label",
    group: "US",
    enabled: true,
    request: { url: "https://example.com/x", auth: { mode: "none" } },
    response: { itemsPath: "", datePath: "date", ...response },
  };
}

describe("resolvePath", () => {
  it("returns the root for an empty path", () => {
    const root = [1, 2];
    expect(resolvePath(root, "")).toBe(root);
  });

  it("walks nested keys", () => {
    expect(resolvePath({ a: { b: { c: 7 } } }, "a.b.c")).toBe(7);
  });

  it("returns undefined instead of throwing on a missing branch", () => {
    expect(resolvePath({ a: 1 }, "a.b.c")).toBeUndefined();
    expect(resolvePath(null, "a")).toBeUndefined();
  });
});

describe("normalizeDate", () => {
  it("keeps a plain date", () => {
    expect(normalizeDate("2026-07-20")).toBe("2026-07-20");
  });

  it("truncates an ISO datetime to its date", () => {
    expect(normalizeDate("2026-07-20T09:00:00+09:00")).toBe("2026-07-20");
  });

  it("reads epoch seconds and milliseconds", () => {
    expect(normalizeDate(1_770_000_000)).toBe(normalizeDate(1_770_000_000_000));
  });

  it("rejects values it cannot interpret", () => {
    expect(normalizeDate("not a date")).toBeNull();
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate({})).toBeNull();
  });
});

describe("parseSeries", () => {
  it("reads a nested array and sorts oldest-first regardless of API order", () => {
    const json = {
      observations: [
        { date: "2026-07-03", value: "3" },
        { date: "2026-07-01", value: "1" },
        { date: "2026-07-02", value: "2" },
      ],
    };
    const points = parseSeries(series({ itemsPath: "observations" }), json);
    expect(points).toEqual([
      { date: "2026-07-01", value: 1 },
      { date: "2026-07-02", value: 2 },
      { date: "2026-07-03", value: 3 },
    ]);
  });

  it("reads a root-level array", () => {
    const json = [{ date: "2026-07-01", value: 10 }];
    expect(parseSeries(series({}), json)).toEqual([
      { date: "2026-07-01", value: 10 },
    ]);
  });

  it("drops rows matching a missing-value sentinel", () => {
    const json = [
      { date: "2026-07-01", value: "." },
      { date: "2026-07-02", value: "5" },
    ];
    const points = parseSeries(series({ skipValues: ["."] }), json);
    expect(points).toEqual([{ date: "2026-07-02", value: 5 }]);
  });

  it("drops rows whose value is not numeric", () => {
    const json = [
      { date: "2026-07-01", value: "n/a" },
      { date: "2026-07-02", value: "5" },
    ];
    expect(parseSeries(series({}), json)).toEqual([
      { date: "2026-07-02", value: 5 },
    ]);
  });

  it("names both paths when nothing parsed, which is the wrong-path case", () => {
    const json = [{ observed_on: "2026-07-01", close: 10 }];
    expect(() => parseSeries(series({}), json)).toThrow(ConnectorFetchError);
    expect(() => parseSeries(series({}), json)).toThrow(/datePath "date"/);
  });

  it("reports what it found when itemsPath does not point at an array", () => {
    expect(() =>
      parseSeries(series({ itemsPath: "data" }), { data: { nope: 1 } })
    ).toThrow(/expected an array at "data", got an object with keys \[nope\]/);
  });
});

describe("parseEvents", () => {
  it("uses the fetched label when present", () => {
    const json = [{ date: "2026-07-01", release_name: "CPI" }];
    expect(parseEvents(events({ labelPath: "release_name" }), json)).toEqual([
      { id: "CAL|2026-07-01", date: "2026-07-01", label: "CPI" },
    ]);
  });

  it("falls back to the connector label when the path is absent or empty", () => {
    const json = [{ date: "2026-07-01", release_name: "" }];
    expect(parseEvents(events({ labelPath: "release_name" }), json)).toEqual([
      { id: "CAL|2026-07-01", date: "2026-07-01", label: "Fallback Label" },
    ]);
  });

  it("skips undated rows rather than failing the whole calendar", () => {
    const json = [{ date: "nope" }, { date: "2026-07-01" }];
    expect(parseEvents(events({}), json)).toHaveLength(1);
  });
});

describe("substitute", () => {
  it("replaces known placeholders", () => {
    expect(substitute("count={{limit}}", { limit: 30 })).toBe("count=30");
    expect(substitute("{{from}}..{{to}}", { from: "a", to: "b" })).toBe("a..b");
  });

  it("leaves plain values untouched", () => {
    expect(substitute("KRW-BTC", {})).toBe("KRW-BTC");
  });

  it("throws on an unknown placeholder instead of emptying it", () => {
    // Silently substituting "" would produce a request that looks fine and
    // returns the wrong data, which is the failure this guards.
    expect(() => substitute("x={{offset}}", { limit: 1 })).toThrow(
      /unknown placeholder \{\{offset\}\}/
    );
  });

  it("throws when a placeholder is valid but not supplied for this kind", () => {
    expect(() => substitute("start={{from}}", { limit: 10 })).toThrow(
      ConnectorFetchError
    );
  });
});
