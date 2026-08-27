import type { IncomingMessage } from "http";
import type { ReasonInput } from "../todos/journal";
import { ValidationError, type WriteContext } from "../todos/types";
import { asObject, assertOnlyKeys } from "../todos/validate";
import { readJsonBody } from "./router";

// How a write route reads its request. Every mutating handler needs the same
// two things out of one payload — the domain input, and the journal `reason`
// riding along with it — and each had spelled the split out itself: parse,
// key-check against the DTO allowlist plus "reason", validate the reason, then
// delete it so the cast to the DTO stays honest. One missed delete leaks a
// transport field into domain input, and one divergent reason check gives the
// agent a different contract per path, so the sequence lives here instead.

// Validates an optional caller-supplied reason ("--reason" in dyd) for the
// write context. The row itself is minted lazily by resolveReasonId inside the
// write's transaction (journal.ts), so a write that journals nothing — failed
// validation, unknown id, no-change patch — leaves no orphan reasons row.
// JSON `null` is treated as absent, not rejected: the DELETE query param has
// no way to distinguish the two (URLSearchParams.get returns null), and some
// client serializers emit null for omitted optionals (docs/spec/todos-agent-api.md).
export function agentReason(reason: unknown): ReasonInput | undefined {
  if (reason === undefined || reason === null) return undefined;
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new ValidationError("reason must be a non-empty string");
  }
  return { source: "agent", text: reason.trim() };
}

/**
 * A mutation body: the DTO's own keys plus `reason`, split into the domain
 * input and the write context. Anything written through this API is
 * agent-authored by definition, so the source is fixed.
 */
export async function readAgentWrite<T>(
  req: IncomingMessage,
  allowedKeys: readonly string[]
): Promise<{ input: T; ctx: WriteContext }> {
  const body = asObject(await readJsonBody(req), "body");
  assertOnlyKeys(body, [...allowedKeys, "reason"], "body");
  const reason = agentReason(body.reason);
  delete body.reason;
  return { input: body as T, ctx: { source: "agent", reason } };
}

/** DELETE reads no body, so its reason travels as a query param. */
export function agentDeleteContext(query: URLSearchParams): WriteContext {
  return { source: "agent", reason: agentReason(query.get("reason")) };
}
