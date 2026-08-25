import { describe, expect, it } from "vitest";
import { buildSheetLines, isNowInRange, markerIndex } from "./sheet-lines";

function entry(id: string, start: string, end: string, todoId = `t-${id}`) {
  return { id, todoId, start, end };
}

describe("buildSheetLines", () => {
  it("joins entries with their todos", () => {
    const lines = buildSheetLines([entry("a", "10:00", "11:00", "t1")], {
      t1: { title: "Write phase 6", done: true },
    });
    expect(lines).toEqual([
      {
        entryId: "a",
        todoId: "t1",
        start: "10:00",
        end: "11:00",
        title: "Write phase 6",
        done: true,
        missing: false,
      },
    ]);
  });

  it("falls back for a todo that no longer resolves", () => {
    const [line] = buildSheetLines([entry("a", "10:00", "11:00", "gone")], {});
    expect(line.title).toBe("(deleted todo)");
    expect(line.done).toBe(false);
    expect(line.missing).toBe(true);
  });

  it("sorts in lived order: 05:00 first, small hours last", () => {
    const lines = buildSheetLines(
      [
        entry("night", "01:00", "02:00"),
        entry("evening", "23:00", "23:30"),
        entry("dawn", "05:00", "06:00"),
        entry("noon", "12:00", "13:00"),
      ],
      {}
    );
    expect(lines.map((l) => l.entryId)).toEqual([
      "dawn",
      "noon",
      "evening",
      "night",
    ]);
  });

  it("keeps input order on equal starts (stable sort)", () => {
    const lines = buildSheetLines(
      [entry("first", "10:00", "11:00"), entry("second", "10:00", "12:00")],
      {}
    );
    expect(lines.map((l) => l.entryId)).toEqual(["first", "second"]);
  });
});

describe("markerIndex", () => {
  const lines = [
    { start: "09:00" },
    { start: "13:00" },
    { start: "22:00" },
  ];

  it("is 0 for an empty list", () => {
    expect(markerIndex([], "12:00")).toBe(0);
  });

  it("sits above the first line before anything started", () => {
    expect(markerIndex(lines, "07:30")).toBe(0);
  });

  it("sits after every line that already started", () => {
    expect(markerIndex(lines, "13:00")).toBe(2);
    expect(markerIndex(lines, "14:00")).toBe(2);
  });

  it("sits below the last line once all have started", () => {
    expect(markerIndex(lines, "23:00")).toBe(3);
  });

  it("places a small-hours now after the evening lines", () => {
    expect(markerIndex(lines, "01:00")).toBe(3);
  });

  it("counts a line starting exactly now, including the 05:00 boundary", () => {
    expect(markerIndex([{ start: "05:00" }, { start: "06:00" }], "05:00")).toBe(1);
  });
});

describe("isNowInRange", () => {
  it("is true inside and false outside a plain range", () => {
    const range = { start: "10:00", end: "12:00" };
    expect(isNowInRange(range, "10:00")).toBe(true);
    expect(isNowInRange(range, "11:59")).toBe(true);
    expect(isNowInRange(range, "12:00")).toBe(false);
    expect(isNowInRange(range, "09:59")).toBe(false);
  });

  it('treats an end of "05:00" as end-of-day', () => {
    const range = { start: "22:00", end: "05:00" };
    expect(isNowInRange(range, "03:00")).toBe(true);
    expect(isNowInRange(range, "21:00")).toBe(false);
  });

  it("spans the midnight wrap", () => {
    const range = { start: "23:00", end: "01:00" };
    expect(isNowInRange(range, "00:30")).toBe(true);
    expect(isNowInRange(range, "02:00")).toBe(false);
  });

  it("contains every now in the whole-day block", () => {
    const range = { start: "05:00", end: "05:00" };
    expect(isNowInRange(range, "05:00")).toBe(true);
    expect(isNowInRange(range, "04:59")).toBe(true);
  });
});
