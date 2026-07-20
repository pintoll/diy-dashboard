import { describe, expect, it } from "vitest";
import { ValidationError } from "../todos/types";
import { DEFAULT_CONNECTORS } from "./defaults";
import { validateConnector } from "./validate";

function base(overrides: Record<string, unknown> = {}) {
  return {
    id: "TEST",
    kind: "series",
    label: "Test",
    group: "Test",
    request: {
      url: "https://api.example.com/v1/series",
      query: { limit: "{{limit}}" },
      auth: { mode: "none" },
    },
    response: { itemsPath: "data", datePath: "date", valuePath: "value" },
    display: { unit: "index", fractionDigits: 2 },
    ...overrides,
  };
}

describe("seeded defaults", () => {
  // A default that fails validation is dropped at startup with only a console
  // line, leaving a user with an empty widget and no obvious cause.
  it("every default connector validates", () => {
    for (const connector of DEFAULT_CONNECTORS) {
      expect(() => validateConnector(connector)).not.toThrow();
    }
  });

  it("covers both kinds", () => {
    const kinds = new Set(DEFAULT_CONNECTORS.map((c) => c.kind));
    expect(kinds).toEqual(new Set(["series", "events"]));
  });

  it("never embeds a secret in a definition", () => {
    // Definitions are plaintext and shareable; credentials are referenced by
    // name and resolved at request time.
    const serialized = JSON.stringify(DEFAULT_CONNECTORS);
    expect(serialized).not.toMatch(/api_key["\s:=]+[A-Za-z0-9]{16,}/);
  });
});

describe("validateConnector", () => {
  it("accepts a minimal series connector and defaults enabled to true", () => {
    expect(validateConnector(base()).enabled).toBe(true);
  });

  it("respects an explicit enabled: false", () => {
    expect(validateConnector(base({ enabled: false })).enabled).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(() => validateConnector(base({ kind: "candles" }))).toThrow(
      /kind must be "series" or "events"/
    );
  });

  it("rejects a non-https URL through the same error channel as other fields", () => {
    const input = base({
      request: { url: "http://api.example.com", auth: { mode: "none" } },
    });
    // UnsafeUrlError is re-thrown as ValidationError so the agent API maps it
    // to 400 with an actionable message rather than a 500.
    expect(() => validateConnector(input)).toThrow(ValidationError);
    expect(() => validateConnector(input)).toThrow(/must use https/);
  });

  it("rejects a URL aimed at loopback", () => {
    expect(() =>
      validateConnector(
        base({
          request: { url: "https://127.0.0.1:8799/api", auth: { mode: "none" } },
        })
      )
    ).toThrow(/private or loopback/);
  });

  it("requires a credential name for authenticated modes", () => {
    expect(() =>
      validateConnector(
        base({
          request: {
            url: "https://api.example.com/x",
            auth: { mode: "query", param: "api_key" },
          },
        })
      )
    ).toThrow(/request\.auth\.credential/);
  });

  it("rejects path segments that are not simple keys", () => {
    expect(() =>
      validateConnector(
        base({
          response: {
            itemsPath: "data[*]",
            datePath: "date",
            valuePath: "value",
          },
        })
      )
    ).toThrow(/segment "data\[\*\]"/);
  });

  it("allows an empty itemsPath, meaning the root is the array", () => {
    expect(() =>
      validateConnector(
        base({
          response: { itemsPath: "", datePath: "date", valuePath: "value" },
        })
      )
    ).not.toThrow();
  });

  it("rejects an empty datePath, which has no root-level meaning", () => {
    expect(() =>
      validateConnector(
        base({
          response: { itemsPath: "data", datePath: "", valuePath: "value" },
        })
      )
    ).toThrow(/response\.datePath must not be empty/);
  });

  it("rejects ids that could collide with route syntax", () => {
    expect(() => validateConnector(base({ id: "a/b" }))).toThrow(/^id must start/);
    expect(() => validateConnector(base({ id: "" }))).toThrow(/non-empty string/);
  });

  it("rejects an unknown display unit", () => {
    expect(() =>
      validateConnector(base({ display: { unit: "dollars", fractionDigits: 2 } }))
    ).toThrow(/display\.unit must be one of/);
  });

  it("rejects non-scalar meta values", () => {
    expect(() =>
      validateConnector(base({ meta: { country: { name: "US" } } }))
    ).toThrow(/meta\.country must be a string, number, or boolean/);
  });

  it("accepts an events connector without display", () => {
    const input = base({
      kind: "events",
      response: { itemsPath: "release_dates", datePath: "date" },
      display: undefined,
    });
    expect(validateConnector(input).kind).toBe("events");
  });
});
