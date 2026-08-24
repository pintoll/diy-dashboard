import { describe, it, expect } from "vitest";
import { DAY_START_HOUR, dayOf, dayStartMs, today } from "./day";

// This module is the single definition of "which day is it" for both processes,
// so the 05:00-to-05:00 rule from docs/design/assistant-behavior.md is pinned
// here rather than left to whichever caller reads it next.
//
// Every instant below is built as a UTC epoch, so the expectations also prove
// the answer does not depend on the machine timezone (KST = UTC+9, no DST).
const at = (iso: string): number => Date.parse(iso);

describe("dayOf", () => {
  it("puts the minute before 05:00 KST on the previous day", () => {
    expect(dayOf(at("2026-08-23T19:59:00Z"))).toBe("2026-08-23"); // 08-24 04:59 KST
  });

  it("starts the new day exactly at 05:00 KST", () => {
    expect(dayOf(at("2026-08-23T20:00:00Z"))).toBe("2026-08-24"); // 08-24 05:00 KST
  });

  it("keeps the rest of the day on the calendar date", () => {
    expect(dayOf(at("2026-08-24T03:00:00Z"))).toBe("2026-08-24"); // 08-24 12:00 KST
    expect(dayOf(at("2026-08-24T14:59:00Z"))).toBe("2026-08-24"); // 08-24 23:59 KST
  });

  it("carries the boundary across a month end", () => {
    expect(dayOf(at("2026-07-31T19:59:00Z"))).toBe("2026-07-31"); // 08-01 04:59 KST
    expect(dayOf(at("2026-07-31T20:00:00Z"))).toBe("2026-08-01"); // 08-01 05:00 KST
  });

  it("carries the boundary across a year end", () => {
    expect(dayOf(at("2025-12-31T19:00:00Z"))).toBe("2025-12-31"); // 01-01 04:00 KST
    expect(dayOf(at("2025-12-31T20:00:00Z"))).toBe("2026-01-01"); // 01-01 05:00 KST
  });

  it("is exactly DAY_START_HOUR wide at the seam", () => {
    // The small hours of 08-24 belong to 08-23 right up to the boundary, and
    // one hour earlier than the boundary is still the previous day.
    const boundary = at("2026-08-23T20:00:00Z");
    expect(dayOf(boundary - 1)).toBe("2026-08-23");
    expect(dayOf(boundary - DAY_START_HOUR * 60 * 60 * 1000)).toBe("2026-08-23");
  });
});

describe("dayStartMs", () => {
  it("is the inverse of dayOf at the boundary", () => {
    expect(dayStartMs("2026-08-24")).toBe(at("2026-08-23T20:00:00Z")); // 08-24 05:00 KST
    expect(dayOf(dayStartMs("2026-08-24"))).toBe("2026-08-24");
  });

  it("puts the millisecond before the start on the previous day", () => {
    expect(dayOf(dayStartMs("2026-08-24") - 1)).toBe("2026-08-23");
  });

  it("spans exactly 24 hours to the next day's start", () => {
    expect(dayStartMs("2026-08-25") - dayStartMs("2026-08-24")).toBe(24 * 60 * 60 * 1000);
  });
});

describe("today", () => {
  it("resolves the current instant through the same rule", () => {
    expect(today()).toBe(dayOf(Date.now()));
  });
});
