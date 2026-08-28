import { normalizeName, normalizeOptionalDate } from "./fields";
import {
  ValidationError,
  type ProjectDocPatch,
  type ProjectKind,
  type ProjectStatus,
} from "./types";

// Field-level rules for projects and their docs, kept db-free so vitest can
// exercise them: better-sqlite3 is built against Electron's ABI and cannot load
// under a plain node test run, so everything decidable without a connection
// lives here and projects.ts / project-docs.ts stay thin SQL.
//
// The two shapes the todo layer normalizes the same way — a required name, an
// optional date — come from fields.ts, so title and date rules cannot fork
// between a todo and a project.
//
// The SQL CHECKs in schema.ts encode the same value sets. That duplication is
// deliberate: these throw ValidationError (400) with a legible message, and the
// CHECK is the backstop for anything that bypasses this layer.

const MAX_TITLE_LENGTH = 200;
const MAX_OUTCOME_LENGTH = 500;
const MAX_DOC_TITLE_LENGTH = 100;

const KINDS: ProjectKind[] = ["project", "area"];
const STATUSES: ProjectStatus[] = ["active", "someday", "done", "archived"];

export function normalizeProjectTitle(title: unknown): string {
  return normalizeName(title, "title", MAX_TITLE_LENGTH);
}

export function normalizeDocTitle(title: unknown): string {
  return normalizeName(title, "title", MAX_DOC_TITLE_LENGTH);
}

export function normalizeKind(kind: unknown): ProjectKind {
  if (typeof kind !== "string" || !KINDS.includes(kind as ProjectKind)) {
    throw new ValidationError(`kind must be one of ${KINDS.join(", ")}`);
  }
  return kind as ProjectKind;
}

export function normalizeStatus(status: unknown): ProjectStatus {
  if (typeof status !== "string" || !STATUSES.includes(status as ProjectStatus)) {
    throw new ValidationError(`status must be one of ${STATUSES.join(", ")}`);
  }
  return status as ProjectStatus;
}

export function normalizeOutcome(outcome: unknown): string | null {
  if (outcome === undefined || outcome === null) return null;
  if (typeof outcome !== "string") {
    throw new ValidationError("outcome must be a string or null");
  }
  const trimmed = outcome.trim();
  if (trimmed.length > MAX_OUTCOME_LENGTH) {
    throw new ValidationError(`outcome must be at most ${MAX_OUTCOME_LENGTH} characters`);
  }
  return trimmed.length > 0 ? trimmed : null;
}

// A soft marker, so null is a first-class value rather than a missing deadline.
export function normalizeTargetDate(value: unknown): string | null {
  return normalizeOptionalDate(value, "targetDate");
}

export function normalizeDocBody(body: unknown): string {
  if (body === undefined || body === null) return "";
  if (typeof body !== "string") {
    throw new ValidationError("body must be a string");
  }
  return body;
}

/**
 * The archive stamp follows the status rather than being set by hand: entering
 * `archived` records when, leaving it clears the record, and re-archiving
 * re-stamps. Staying archived keeps the original stamp, so a rename doesn't
 * rewrite when the project was shelved.
 */
export function resolveArchivedAt(
  previous: ProjectStatus | null,
  next: ProjectStatus,
  previousArchivedAt: string | null,
  now: () => string
): string | null {
  if (next !== "archived") return null;
  if (previous === "archived" && previousArchivedAt !== null) return previousArchivedAt;
  return now();
}

/**
 * A doc patch's resulting body. `body` replaces; `append` adds a line to what
 * is already there. Both together is rejected rather than ordered arbitrarily.
 * Returns null when the patch says nothing about the body.
 */
export function resolveDocBodyPatch(
  patch: Pick<ProjectDocPatch, "body" | "append">,
  currentBody: string
): string | null {
  if (patch.body !== undefined && patch.append !== undefined) {
    throw new ValidationError("body and append are mutually exclusive");
  }
  if (patch.body !== undefined) {
    if (typeof patch.body !== "string") {
      throw new ValidationError("body must be a string");
    }
    return patch.body;
  }
  if (patch.append !== undefined) {
    if (typeof patch.append !== "string") {
      throw new ValidationError("append must be a string");
    }
    const text = patch.append.trim();
    if (text.length === 0) {
      throw new ValidationError("append must not be empty");
    }
    return currentBody.length === 0 ? text : `${currentBody}\n${text}`;
  }
  return null;
}
