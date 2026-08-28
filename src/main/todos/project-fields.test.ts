import { describe, expect, it } from "vitest";
import {
  normalizeDocBody,
  normalizeDocTitle,
  normalizeKind,
  normalizeOutcome,
  normalizeProjectTitle,
  normalizeStatus,
  normalizeTargetDate,
  resolveArchivedAt,
  resolveDocBodyPatch,
} from "./project-fields";
import { ValidationError } from "./types";

// The db-free half of the projects layer. projects.ts / project-docs.ts need
// better-sqlite3, which cannot load under vitest (Electron ABI); they are
// covered by the live agent-API pass instead.

const now = (): string => "2026-08-27T09:00:00.000Z";

describe("normalizeProjectTitle", () => {
  it("trims", () => {
    expect(normalizeProjectTitle("  ship v1  ")).toBe("ship v1");
  });

  it("rejects an empty or blank title", () => {
    expect(() => normalizeProjectTitle("")).toThrow(ValidationError);
    expect(() => normalizeProjectTitle("   ")).toThrow(ValidationError);
  });

  it("rejects a non-string", () => {
    expect(() => normalizeProjectTitle(42)).toThrow(ValidationError);
    expect(() => normalizeProjectTitle(null)).toThrow(ValidationError);
  });

  it("rejects an over-long title", () => {
    expect(() => normalizeProjectTitle("x".repeat(201))).toThrow(ValidationError);
    expect(normalizeProjectTitle("x".repeat(200))).toHaveLength(200);
  });
});

describe("normalizeDocTitle", () => {
  it("caps at 100 characters", () => {
    expect(normalizeDocTitle("x".repeat(100))).toHaveLength(100);
    expect(() => normalizeDocTitle("x".repeat(101))).toThrow(ValidationError);
  });
});

describe("normalizeKind", () => {
  it("accepts the two kinds", () => {
    expect(normalizeKind("project")).toBe("project");
    expect(normalizeKind("area")).toBe("area");
  });

  it("rejects anything else", () => {
    expect(() => normalizeKind("resource")).toThrow(ValidationError);
    expect(() => normalizeKind(undefined)).toThrow(ValidationError);
  });
});

describe("normalizeStatus", () => {
  it("accepts the four statuses", () => {
    for (const status of ["active", "someday", "done", "archived"]) {
      expect(normalizeStatus(status)).toBe(status);
    }
  });

  it("rejects anything else", () => {
    expect(() => normalizeStatus("paused")).toThrow(ValidationError);
  });
});

describe("normalizeOutcome", () => {
  it("treats blank and missing as null", () => {
    expect(normalizeOutcome(undefined)).toBeNull();
    expect(normalizeOutcome(null)).toBeNull();
    expect(normalizeOutcome("   ")).toBeNull();
  });

  it("trims a real outcome", () => {
    expect(normalizeOutcome(" shipped to main ")).toBe("shipped to main");
  });

  it("rejects an over-long outcome", () => {
    expect(() => normalizeOutcome("x".repeat(501))).toThrow(ValidationError);
  });
});

describe("normalizeTargetDate", () => {
  it("passes a valid date through", () => {
    expect(normalizeTargetDate("2026-09-01")).toBe("2026-09-01");
  });

  it("treats missing as null", () => {
    expect(normalizeTargetDate(undefined)).toBeNull();
    expect(normalizeTargetDate(null)).toBeNull();
  });

  it("rejects a malformed or impossible date", () => {
    expect(() => normalizeTargetDate("2026-9-1")).toThrow(ValidationError);
    expect(() => normalizeTargetDate("2026-02-31")).toThrow(ValidationError);
  });
});

describe("normalizeDocBody", () => {
  it("defaults to an empty string and preserves whitespace", () => {
    expect(normalizeDocBody(undefined)).toBe("");
    expect(normalizeDocBody(null)).toBe("");
    expect(normalizeDocBody("  line\n\n")).toBe("  line\n\n");
  });

  it("rejects a non-string", () => {
    expect(() => normalizeDocBody(7)).toThrow(ValidationError);
  });
});

describe("resolveArchivedAt", () => {
  it("stamps on entering archived", () => {
    expect(resolveArchivedAt("active", "archived", null, now)).toBe(now());
  });

  it("keeps the original stamp while it stays archived", () => {
    expect(resolveArchivedAt("archived", "archived", "2026-01-01T00:00:00.000Z", now)).toBe(
      "2026-01-01T00:00:00.000Z"
    );
  });

  it("re-stamps if archived with no prior stamp", () => {
    expect(resolveArchivedAt("archived", "archived", null, now)).toBe(now());
  });

  it("clears on leaving archived", () => {
    expect(resolveArchivedAt("archived", "active", "2026-01-01T00:00:00.000Z", now)).toBeNull();
  });

  it("stamps a project created straight into the archive", () => {
    expect(resolveArchivedAt(null, "archived", null, now)).toBe(now());
    expect(resolveArchivedAt(null, "active", null, now)).toBeNull();
  });
});

describe("resolveDocBodyPatch", () => {
  it("returns null when the patch says nothing about the body", () => {
    expect(resolveDocBodyPatch({}, "kept")).toBeNull();
  });

  it("replaces on body", () => {
    expect(resolveDocBodyPatch({ body: "fresh" }, "old")).toBe("fresh");
    expect(resolveDocBodyPatch({ body: "" }, "old")).toBe("");
  });

  it("appends a line to existing prose", () => {
    expect(resolveDocBodyPatch({ append: "2026-08-27: wired IPC" }, "goal: ship")).toBe(
      "goal: ship\n2026-08-27: wired IPC"
    );
  });

  it("appends without a leading newline when the doc is empty", () => {
    expect(resolveDocBodyPatch({ append: " first " }, "")).toBe("first");
  });

  it("rejects body and append together", () => {
    expect(() => resolveDocBodyPatch({ body: "a", append: "b" }, "")).toThrow(ValidationError);
  });

  it("rejects a blank append", () => {
    expect(() => resolveDocBodyPatch({ append: "   " }, "")).toThrow(ValidationError);
  });

  it("rejects non-string values", () => {
    expect(() => resolveDocBodyPatch({ body: 1 as unknown as string }, "")).toThrow(
      ValidationError
    );
    expect(() => resolveDocBodyPatch({ append: 1 as unknown as string }, "")).toThrow(
      ValidationError
    );
  });
});
