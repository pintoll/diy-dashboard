import {
  listCredentials,
  removeCredential,
  setCredential,
} from "../connectors/credentials";
import { testConnector, type ConnectorTestResult } from "../connectors/runtime";
import {
  listConnectors,
  mergeConnectorPatch,
  patchConnector,
  removeConnector,
  requireConnector,
  upsertConnector,
} from "../connectors/store";
import type { Connector } from "../connectors/types";
import { NotFoundError, ValidationError } from "../todos/types";
import { readJsonBody, sendJson, type Route } from "./router";

// The connectors surface of the agent API. Handlers translate HTTP <-> the same
// domain functions the IPC layer calls, so a definition written from a terminal
// is validated and stored exactly like one written from the settings dialog.
//
// No route here can return a credential secret: the credential routes speak only
// in CredentialMeta (name + allowedHost), and a connector definition names a
// credential without holding one.

const KINDS: Array<Connector["kind"]> = ["series", "events"];

function asObject(body: unknown, what: string): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError(`${what} must be a JSON object`);
  }
  return body as Record<string, unknown>;
}

// `skipTest` is a request option, not a connector field. Split it off so the
// object that gets validated and stored is exactly the definition the caller
// meant to write.
function takeSkipTest(body: Record<string, unknown>): {
  skipTest: boolean;
  definition: Record<string, unknown>;
} {
  const { skipTest, ...definition } = body;
  if (skipTest !== undefined && typeof skipTest !== "boolean") {
    throw new ValidationError("skipTest must be a boolean");
  }
  return { skipTest: skipTest === true, definition };
}

// Writes run the definition end-to-end before anything is persisted. This is the
// point of the whole surface: an agent that guesses a wrong valuePath gets a 400
// naming the problem, instead of a stored connector whose card renders "—"
// forever. `skipTest` opts out for the offline case.
// Fields that describe *whether* a connector runs rather than *how*. A patch
// touching only these is a state flip, so gating it on a live fetch would mean
// a source cannot be switched back on while its API is down or its credential
// is missing -- exactly when someone is trying to recover it.
const STATE_ONLY_FIELDS = new Set(["enabled", "order"]);

function isStateOnlyPatch(patch: Record<string, unknown>): boolean {
  const keys = Object.keys(patch);
  return keys.length > 0 && keys.every((key) => STATE_ONLY_FIELDS.has(key));
}

async function dryRun(
  definition: unknown,
  skipTest: boolean
): Promise<ConnectorTestResult | null> {
  if (skipTest) return null;
  const test = await testConnector(definition);
  if (!test.ok) {
    throw new ValidationError(
      `connector test failed: ${test.error ?? "unknown error"}`
    );
  }
  return test;
}

export const connectorsRoutes: Route[] = [
  {
    method: "GET",
    pattern: "/api/connectors",
    handler: (_req, res, _params, query) => {
      const group = query.get("group");
      const kind = query.get("kind");
      // A typo'd kind returning an empty list would read as "no connectors" and
      // send the caller looking in the wrong place.
      if (kind !== null && !KINDS.includes(kind as Connector["kind"])) {
        throw new ValidationError(`kind must be one of ${KINDS.join(", ")}`);
      }
      const connectors = listConnectors().filter(
        (c) =>
          (group === null || c.group === group) &&
          (kind === null || c.kind === kind)
      );
      sendJson(res, 200, { connectors });
    },
  },
  {
    method: "POST",
    pattern: "/api/connectors",
    handler: async (req, res) => {
      const { skipTest, definition } = takeSkipTest(
        asObject(await readJsonBody(req), "body")
      );
      const test = await dryRun(definition, skipTest);
      sendJson(res, 201, { connector: upsertConnector(definition), test });
    },
  },
  // Declared before /api/connectors/:id so the intent is readable: this is the
  // "what would happen" probe for a definition that has no id yet.
  {
    method: "POST",
    pattern: "/api/connectors/test",
    handler: async (req, res) => {
      // Unlike a write, a failed test is still a 200 here. The caller asked what
      // would happen, and `ok: false` with its error is that answer.
      sendJson(res, 200, { test: await testConnector(await readJsonBody(req)) });
    },
  },
  {
    method: "GET",
    pattern: "/api/connectors/:id",
    handler: (_req, res, params) => {
      sendJson(res, 200, { connector: requireConnector(params.id) });
    },
  },
  {
    method: "PATCH",
    pattern: "/api/connectors/:id",
    handler: async (req, res, params) => {
      const { skipTest, definition } = takeSkipTest(
        asObject(await readJsonBody(req), "body")
      );
      // The dry-run has to see the merged definition rather than the patch
      // fragment, and it must be the same merge patchConnector will perform --
      // hence the shared helper. The store is not touched until the test passes.
      const test = await dryRun(
        mergeConnectorPatch(params.id, definition),
        skipTest || isStateOnlyPatch(definition)
      );
      sendJson(res, 200, { connector: patchConnector(params.id, definition), test });
    },
  },
  {
    method: "DELETE",
    pattern: "/api/connectors/:id",
    handler: (_req, res, params) => {
      removeConnector(params.id);
      sendJson(res, 204, undefined);
    },
  },
  {
    method: "POST",
    pattern: "/api/connectors/:id/test",
    handler: async (_req, res, params) => {
      sendJson(res, 200, { test: await testConnector(requireConnector(params.id)) });
    },
  },
  // --- Credentials ----------------------------------------------------------
  // Write-only secrets. There is deliberately no route that reads one back: an
  // agent that needs a key has to be given it out of band, and a leaked token
  // for this API must not turn into a leaked FRED key.
  {
    method: "GET",
    pattern: "/api/credentials",
    handler: (_req, res) => {
      sendJson(res, 200, { credentials: listCredentials() });
    },
  },
  {
    method: "PUT",
    pattern: "/api/credentials/:name",
    handler: async (req, res, params) => {
      const body = asObject(await readJsonBody(req), "body");
      // setCredential validates the name, secret, and host and returns meta
      // only; the secret it stored is not part of the return value.
      const credential = setCredential(
        params.name,
        body.secret as string,
        body.allowedHost as string
      );
      sendJson(res, 200, { credential });
    },
  },
  {
    method: "DELETE",
    pattern: "/api/credentials/:name",
    handler: (_req, res, params) => {
      if (!removeCredential(params.name)) {
        throw new NotFoundError(`credential "${params.name}" not found`);
      }
      sendJson(res, 204, undefined);
    },
  },
];
