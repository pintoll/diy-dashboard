import { describe, expect, it } from "vitest";
import { sqliteUtcToMs } from "./sqlite-time";

// The whole reason this function exists: read naively, a CURRENT_TIMESTAMP
// column lands nine hours in the future under KST, which would make a project's
// last-activity day wrong for the whole evening and pin its "saved" label to
// "just now" no matter how long ago it was written.
describe("sqliteUtcToMs", () => {
  it("reads a zoneless SQLite timestamp as UTC", () => {
    expect(sqliteUtcToMs("2026-08-27 06:11:04")).toBe(
      Date.parse("2026-08-27T06:11:04Z")
    );
  });

  it("does not read it as local time", () => {
    if (new Date().getTimezoneOffset() === 0) return;
    expect(sqliteUtcToMs("2026-08-27 06:11:04")).not.toBe(
      Date.parse("2026-08-27 06:11:04")
    );
  });

  it.each([null, undefined, "", "2026-08-27", "2026-08-27T06:11:04Z", "nope"])(
    "returns null for %j",
    (value) => {
      expect(sqliteUtcToMs(value)).toBeNull();
    }
  );
});
