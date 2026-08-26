import { describe, it, expect } from "vitest";
import {
  DAY_START_HOUR,
  addDays,
  clockHm,
  dayEndIso,
  dayEndMs,
  dayOf,
  dayStartIso,
  dayStartMs,
  daysBetween,
  hourOf,
  today,
  weekStartOf,
} from "./day";

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

describe("dayEndMs", () => {
  it("is the next day's start, across month ends too", () => {
    expect(dayEndMs("2026-08-24")).toBe(dayStartMs("2026-08-25"));
    expect(dayEndMs("2026-07-31")).toBe(dayStartMs("2026-08-01"));
  });

  it("bounds the day half-open: the end instant already belongs to the next day", () => {
    expect(dayOf(dayEndMs("2026-08-24") - 1)).toBe("2026-08-24");
    expect(dayOf(dayEndMs("2026-08-24"))).toBe("2026-08-25");
  });
});

describe("dayStartIso / dayEndIso", () => {
  it("renders the window instants in the journal's exact format", () => {
    // toISOString(): fixed-width UTC with milliseconds — the format every
    // ops.at is written in (journal.ts), so string comparison orders by time.
    expect(dayStartIso("2026-08-24")).toBe("2026-08-23T20:00:00.000Z");
    expect(dayEndIso("2026-08-24")).toBe("2026-08-24T20:00:00.000Z");
  });

  it("stays in lockstep with the ms window", () => {
    expect(Date.parse(dayStartIso("2026-08-24"))).toBe(dayStartMs("2026-08-24"));
    expect(Date.parse(dayEndIso("2026-08-24"))).toBe(dayEndMs("2026-08-24"));
    expect(dayEndIso("2026-08-24")).toBe(dayStartIso("2026-08-25"));
  });
});

describe("clockHm", () => {
  it("renders the Seoul wall clock for a UTC instant", () => {
    expect(clockHm(at("2026-08-24T20:57:11.302Z"))).toBe("05:57"); // 08-25 05:57 KST
    expect(clockHm(at("2026-08-24T02:03:00Z"))).toBe("11:03"); // 08-24 11:03 KST
  });

  it("renders midnight as 00:00, not 24:00", () => {
    expect(clockHm(at("2026-08-24T15:00:00Z"))).toBe("00:00"); // 08-25 00:00 KST
  });
});

describe("addDays", () => {
  it("steps a single day in either direction", () => {
    expect(addDays("2026-08-24", 1)).toBe("2026-08-25");
    expect(addDays("2026-08-24", -1)).toBe("2026-08-23");
    expect(addDays("2026-08-24", 0)).toBe("2026-08-24");
  });

  it("carries across month and year ends", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("handles multi-day spans", () => {
    expect(addDays("2026-08-24", 7)).toBe("2026-08-31");
    expect(addDays("2026-08-24", -30)).toBe("2026-07-25");
  });
});

describe("daysBetween", () => {
  it("is zero for the same key and signed by direction", () => {
    expect(daysBetween("2026-08-24", "2026-08-24")).toBe(0);
    expect(daysBetween("2026-08-24", "2026-08-25")).toBe(1);
    expect(daysBetween("2026-08-25", "2026-08-24")).toBe(-1);
  });

  it("counts across a month end", () => {
    expect(daysBetween("2026-08-30", "2026-09-02")).toBe(3);
  });

  it("inverts addDays", () => {
    expect(daysBetween("2026-08-24", addDays("2026-08-24", 42))).toBe(42);
  });
});

describe("weekStartOf", () => {
  // 2026-08-24 is a Monday.
  it("maps a mid-week day to its Monday", () => {
    expect(weekStartOf("2026-08-26")).toBe("2026-08-24"); // Wednesday
    expect(weekStartOf("2026-08-29")).toBe("2026-08-24"); // Saturday
  });

  it("maps a Monday to itself", () => {
    expect(weekStartOf("2026-08-24")).toBe("2026-08-24");
  });

  it("maps a Sunday to the previous Monday, ISO style", () => {
    expect(weekStartOf("2026-08-30")).toBe("2026-08-24");
  });

  it("composes with dayStartMs into a Monday 05:00 KST week start", () => {
    expect(dayStartMs(weekStartOf("2026-08-26"))).toBe(at("2026-08-23T20:00:00Z"));
  });
});

describe("hourOf", () => {
  it("reads the Seoul wall hour regardless of machine timezone", () => {
    expect(hourOf(at("2026-08-24T17:00:00Z"))).toBe(2); // 08-25 02:00 KST
    expect(hourOf(at("2026-08-24T20:00:00Z"))).toBe(5); // 08-25 05:00 KST
  });

  it("renders KST midnight as 0, not 24", () => {
    expect(hourOf(at("2026-08-24T15:00:00Z"))).toBe(0); // 08-25 00:00 KST
  });
});

describe("today", () => {
  it("resolves the current instant through the same rule", () => {
    expect(today()).toBe(dayOf(Date.now()));
  });
});
