import { describe, expect, it } from "vitest";
import { assertSafeUrl, UnsafeUrlError } from "./url-guard";

// Connector URLs come from a settings file and the agent API, so these checks
// are the boundary that keeps that capability aimed at public HTTPS endpoints.

describe("assertSafeUrl", () => {
  it("accepts a public https endpoint", () => {
    const url = assertSafeUrl("https://api.stlouisfed.org/fred/series", "url");
    expect(url.hostname).toBe("api.stlouisfed.org");
  });

  it("rejects non-https schemes", () => {
    expect(() => assertSafeUrl("http://api.example.com", "url")).toThrow(
      UnsafeUrlError
    );
    expect(() => assertSafeUrl("file:///etc/passwd", "url")).toThrow(
      UnsafeUrlError
    );
  });

  it("rejects a malformed URL", () => {
    expect(() => assertSafeUrl("not a url", "url")).toThrow(
      /must be a valid absolute URL/
    );
  });

  it("rejects loopback and localhost", () => {
    // The app's own agent API listens on loopback; a connector must not be
    // able to reach it.
    expect(() => assertSafeUrl("https://127.0.0.1:8799/api/todos", "url")).toThrow(
      UnsafeUrlError
    );
    expect(() => assertSafeUrl("https://localhost/x", "url")).toThrow(
      UnsafeUrlError
    );
    expect(() => assertSafeUrl("https://[::1]/x", "url")).toThrow(UnsafeUrlError);
  });

  it("rejects private IPv4 ranges", () => {
    for (const host of [
      "10.0.0.5",
      "172.16.3.4",
      "172.31.255.1",
      "192.168.1.1",
      "100.64.0.1",
      "0.0.0.0",
    ]) {
      expect(() => assertSafeUrl(`https://${host}/x`, "url")).toThrow(
        UnsafeUrlError
      );
    }
  });

  it("rejects the link-local range used for cloud metadata", () => {
    expect(() => assertSafeUrl("https://169.254.169.254/latest", "url")).toThrow(
      UnsafeUrlError
    );
  });

  it("allows public IPv4 that merely looks adjacent to a private range", () => {
    expect(() => assertSafeUrl("https://172.32.0.1/x", "url")).not.toThrow();
    expect(() => assertSafeUrl("https://11.0.0.1/x", "url")).not.toThrow();
  });

  it("rejects internal hostname suffixes", () => {
    for (const host of ["printer.local", "db.internal", "api.localhost"]) {
      expect(() => assertSafeUrl(`https://${host}/x`, "url")).toThrow(
        UnsafeUrlError
      );
    }
  });

  it("rejects IPv6 unique-local and link-local addresses", () => {
    expect(() => assertSafeUrl("https://[fd00::1]/x", "url")).toThrow(
      UnsafeUrlError
    );
    expect(() => assertSafeUrl("https://[fe80::1]/x", "url")).toThrow(
      UnsafeUrlError
    );
  });

  it("rejects an IPv4-mapped IPv6 loopback address", () => {
    expect(() => assertSafeUrl("https://[::ffff:127.0.0.1]/x", "url")).toThrow(
      UnsafeUrlError
    );
  });

  it("names the offending field so the error is actionable", () => {
    expect(() => assertSafeUrl("http://x.com", "request.url")).toThrow(
      /^request\.url must use https/
    );
  });
});
