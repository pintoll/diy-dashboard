import { today } from "@shared/day";
import { ValidationError, type WriteContext } from "./types";

// "Today" lives in @shared/day now — one 05:00-boundary definition both
// processes import, so main and the renderer cannot disagree about which day a
// todo belongs to. What stays here is validation of the yyyy-MM-dd strings that
// cross IPC and the agent HTTP API, plus the per-intent day below.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Validates a yyyy-MM-dd string and rejects impossible dates (2026-02-31). */
export function assertDate(value: string, field = "date"): string {
  if (!DATE_PATTERN.test(value)) {
    throw new ValidationError(`${field} must be yyyy-MM-dd, got "${value}"`);
  }
  const [y, m, d] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() !== m - 1 ||
    parsed.getUTCDate() !== d
  ) {
    throw new ValidationError(`${field} is not a real date: "${value}"`);
  }
  return value;
}

/**
 * The day a write context happens on: one clock read on first use, cached on
 * the context like `reasonId` and `at` (journal.ts). Every day default of one
 * intent — a dateless todo.create, a dayless plan.create, an un-park — must
 * name the same day, or a batch (apply.ts) whose ops straddle 05:00 splits one
 * atomic intent across two app days under a single journal stamp.
 */
export function contextDay(ctx: WriteContext): string {
  if (ctx.day === undefined) ctx.day = today();
  return ctx.day;
}
