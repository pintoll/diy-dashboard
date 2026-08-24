import { describe, expect, it } from "vitest";
import { rowChanged } from "./journal";

// Only the pure part of journal.ts is unit-tested; createReason/recordOp need
// better-sqlite3, which cannot load under vitest (Electron ABI) and is covered
// by the offline verification script instead.

const row = {
  id: "a1",
  date: "2026-08-24",
  title: "write tests",
  note: null,
  done: 0,
  completed_on: null,
  sort_order: 3,
  worked_sec: 1500,
  source: "user",
  created_at: "2026-08-20 01:00:00",
  updated_at: "2026-08-24 02:00:00",
};

describe("rowChanged", () => {
  it("returns false for identical rows", () => {
    expect(rowChanged(row, { ...row })).toBe(false);
  });

  it("ignores updated_at", () => {
    expect(rowChanged(row, { ...row, updated_at: "2026-08-24 03:00:00" })).toBe(false);
  });

  it.each([
    ["title", "renamed"],
    ["done", 1],
    ["sort_order", 4],
    ["worked_sec", 1800],
    ["source", "agent"],
  ])("detects a change in %s", (key, value) => {
    expect(rowChanged(row, { ...row, [key]: value })).toBe(true);
  });

  it("detects null-to-value and value-to-null transitions", () => {
    expect(rowChanged(row, { ...row, note: "added" })).toBe(true);
    expect(rowChanged(row, { ...row, date: null })).toBe(true);
    expect(rowChanged({ ...row, completed_on: "2026-08-24" }, { ...row })).toBe(true);
  });

  it("treats a key present on only one side as a change", () => {
    const withoutNote = Object.fromEntries(
      Object.entries(row).filter(([key]) => key !== "note")
    );
    expect(rowChanged(row, withoutNote)).toBe(true);
  });
});
