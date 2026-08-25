import { describe, expect, it } from "vitest";
import {
  formatTimeRange,
  normalizePlanTime,
  parseTimeRange,
  suggestRange,
} from "./plan-time-input";

describe("normalizePlanTime", () => {
  it("pads a single-digit hour", () => {
    expect(normalizePlanTime("9:30")).toBe("09:30");
  });

  it("keeps a strict time and trims whitespace", () => {
    expect(normalizePlanTime("09:30")).toBe("09:30");
    expect(normalizePlanTime(" 10:00 ")).toBe("10:00");
  });

  it("rejects garbage", () => {
    expect(normalizePlanTime("24:00")).toBeNull();
    expect(normalizePlanTime("09:60")).toBeNull();
    expect(normalizePlanTime("9")).toBeNull();
    expect(normalizePlanTime("930")).toBeNull();
    expect(normalizePlanTime("abc")).toBeNull();
    expect(normalizePlanTime("")).toBeNull();
  });
});

describe("parseTimeRange", () => {
  it("parses the plain form", () => {
    expect(parseTimeRange("10:00-14:00")).toEqual({ start: "10:00", end: "14:00" });
  });

  it("accepts dash variants, spaces, and unpadded hours", () => {
    expect(parseTimeRange("9:30 – 11:00")).toEqual({ start: "09:30", end: "11:00" });
    expect(parseTimeRange("09:00—10:00")).toEqual({ start: "09:00", end: "10:00" });
    expect(parseTimeRange("23:00~01:00")).toEqual({ start: "23:00", end: "01:00" });
  });

  it("accepts the whole-day block", () => {
    expect(parseTimeRange("05:00-05:00")).toEqual({ start: "05:00", end: "05:00" });
  });

  it("rejects zero-length and 05:00-crossing ranges (the server rule)", () => {
    expect(parseTimeRange("10:00-10:00")).toBeNull();
    expect(parseTimeRange("04:00-06:00")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(parseTimeRange("10:00")).toBeNull();
    expect(parseTimeRange("10:00-14:00-15:00")).toBeNull();
    expect(parseTimeRange("10:00-24:00")).toBeNull();
    expect(parseTimeRange("")).toBeNull();
  });
});

describe("formatTimeRange", () => {
  it("joins with an en dash", () => {
    expect(formatTimeRange("09:30", "10:00")).toBe("09:30–10:00");
  });

  it("round-trips through parseTimeRange", () => {
    expect(parseTimeRange(formatTimeRange("23:00", "01:00"))).toEqual({
      start: "23:00",
      end: "01:00",
    });
  });
});

describe("suggestRange", () => {
  it("rounds up to the next half hour, one hour long", () => {
    expect(suggestRange("10:05")).toEqual({ start: "10:30", end: "11:30" });
    expect(suggestRange("10:40")).toEqual({ start: "11:00", end: "12:00" });
  });

  it("keeps an aligned now as the start", () => {
    expect(suggestRange("10:00")).toEqual({ start: "10:00", end: "11:00" });
    expect(suggestRange("10:30")).toEqual({ start: "10:30", end: "11:30" });
  });

  it("wraps across midnight", () => {
    expect(suggestRange("23:50")).toEqual({ start: "00:00", end: "01:00" });
  });

  it("clamps the end to the 05:00 boundary", () => {
    expect(suggestRange("04:10")).toEqual({ start: "04:30", end: "05:00" });
  });

  it("starts at now inside the day's last half hour", () => {
    expect(suggestRange("04:40")).toEqual({ start: "04:40", end: "05:00" });
    expect(suggestRange("04:59")).toEqual({ start: "04:59", end: "05:00" });
  });
});
