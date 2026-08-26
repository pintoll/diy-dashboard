import { afterEach, describe, expect, it, vi } from "vitest";
import { assertDate, contextDay } from "./date";
import { ValidationError, type WriteContext } from "./types";

// The 05:00 Asia/Seoul boundary itself is pinned in @shared/day.test.ts. What
// matters here is that one write context holds ONE day: the ops of a batch
// (apply.ts) run microseconds apart, and nothing stops the boundary falling
// between two of them, which would split one atomic intent across two app days
// under a single journal stamp.
const at = (iso: string): number => Date.parse(iso);

describe("contextDay", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds the first day it read, even when the clock crosses 05:00", () => {
    vi.useFakeTimers();
    vi.setSystemTime(at("2026-08-26T04:59:59.999+09:00"));
    const ctx: WriteContext = { source: "assistant" };
    expect(contextDay(ctx)).toBe("2026-08-25");

    vi.setSystemTime(at("2026-08-26T05:00:00.000+09:00"));
    expect(contextDay(ctx)).toBe("2026-08-25");
  });

  it("reads the clock again for a fresh context", () => {
    vi.useFakeTimers();
    vi.setSystemTime(at("2026-08-26T05:00:00.000+09:00"));
    expect(contextDay({ source: "agent" })).toBe("2026-08-26");
  });
});

describe("assertDate", () => {
  it("returns a valid date unchanged", () => {
    expect(assertDate("2026-02-28")).toBe("2026-02-28");
  });

  it.each(["2026-2-8", "26-02-08", "today", ""])("rejects %j", (value) => {
    expect(() => assertDate(value)).toThrowError(ValidationError);
  });

  it("rejects a well-formed but impossible date", () => {
    expect(() => assertDate("2026-02-31")).toThrowError(/not a real date/);
  });

  it("names the field in the message", () => {
    expect(() => assertDate("nope", "day")).toThrowError(/^day must be yyyy-MM-dd/);
  });
});
