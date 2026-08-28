import { describe, expect, it } from "vitest";
import { movedBucket } from "./fields";

// crud.ts appends a todo to the end of its destination whenever this says the
// todo changed bucket, so a false positive silently reorders a day the user
// never touched — the reason the rule lives here rather than inline.

const row = (date: string | null, project_id: string | null) => ({ date, project_id });

describe("movedBucket", () => {
  it("is false when nothing moved", () => {
    expect(movedBucket("2026-08-27", "p1", row("2026-08-27", "p1"))).toBe(false);
    expect(movedBucket(null, "p1", row(null, "p1"))).toBe(false);
  });

  it("is true for any change of day", () => {
    expect(movedBucket("2026-08-28", "p1", row("2026-08-27", "p1"))).toBe(true);
    expect(movedBucket(null, "p1", row("2026-08-27", "p1"))).toBe(true);
    expect(movedBucket("2026-08-27", "p1", row(null, "p1"))).toBe(true);
  });

  it("is true when an undated todo is filed, unfiled, or refiled", () => {
    expect(movedBucket(null, "p1", row(null, null))).toBe(true);
    expect(movedBucket(null, null, row(null, "p1"))).toBe(true);
    expect(movedBucket(null, "p2", row(null, "p1"))).toBe(true);
  });

  it("is false when a dated todo is only filed — the day is one list", () => {
    expect(movedBucket("2026-08-27", "p1", row("2026-08-27", null))).toBe(false);
    expect(movedBucket("2026-08-27", null, row("2026-08-27", "p1"))).toBe(false);
    expect(movedBucket("2026-08-27", "p2", row("2026-08-27", "p1"))).toBe(false);
  });
});
