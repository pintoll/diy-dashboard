import { describe, it, expect } from "vitest";
import { comparePlanStart, isPlanTime, planEndMinutes, planMinutes } from "./plan-time";

describe("isPlanTime", () => {
  it("accepts strict two-digit HH:MM across the clock", () => {
    expect(isPlanTime("00:00")).toBe(true);
    expect(isPlanTime("05:00")).toBe(true);
    expect(isPlanTime("23:59")).toBe(true);
  });

  it.each(["9:00", "24:00", "12:60", "12:5", "1200", "12-00", "", " 12:00", "12:00 "])(
    "rejects %j",
    (value) => {
      expect(isPlanTime(value)).toBe(false);
    }
  );

  it("rejects non-strings", () => {
    expect(isPlanTime(720)).toBe(false);
    expect(isPlanTime(null)).toBe(false);
    expect(isPlanTime(undefined)).toBe(false);
  });
});

describe("planMinutes", () => {
  it("anchors the day at 05:00", () => {
    expect(planMinutes("05:00")).toBe(0);
    expect(planMinutes("04:59")).toBe(1439);
  });

  it("orders the small hours after the evening", () => {
    // A 23:00 → 01:00 late-night block is the normal case the wrap exists for.
    expect(planMinutes("09:00")).toBeLessThan(planMinutes("23:00"));
    expect(planMinutes("23:00")).toBeLessThan(planMinutes("01:00"));
  });
});

describe("planEndMinutes and the end-after-start rule", () => {
  const valid = (start: string, end: string): boolean =>
    planEndMinutes(end) > planMinutes(start);

  it('reads "05:00" as end-of-day when used as an end', () => {
    expect(planEndMinutes("05:00")).toBe(1440);
    expect(valid("03:00", "05:00")).toBe(true);
  });

  it("accepts the midnight wrap", () => {
    expect(valid("23:00", "01:00")).toBe(true);
  });

  it("rejects crossing the 05:00 boundary", () => {
    expect(valid("04:00", "06:00")).toBe(false);
  });

  it("rejects zero-length entries", () => {
    expect(valid("10:00", "10:00")).toBe(false);
    expect(valid("00:00", "00:00")).toBe(false);
  });

  it("rejects reversed ranges within the day", () => {
    expect(valid("14:00", "10:00")).toBe(false);
  });

  it('accepts "05:00"-"05:00", the whole-day block, as the only start==end pair', () => {
    expect(valid("05:00", "05:00")).toBe(true);
  });
});

describe("comparePlanStart", () => {
  it("sorts in lived order, keeping input order on equal starts", () => {
    const entries = [
      { id: "small-hours", start: "01:00" },
      { id: "first-ten", start: "10:00" },
      { id: "second-ten", start: "10:00" },
      { id: "day-start", start: "05:00" },
    ];
    expect([...entries].sort(comparePlanStart).map((e) => e.id)).toEqual([
      "day-start",
      "first-ten",
      "second-ten",
      "small-hours",
    ]);
  });
});
