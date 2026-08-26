import { applyBatch } from "../todos/apply";
import { readJsonBody, sendJson, type Route } from "./router";

// The assistant's batch write: one intent (a required natural-language
// reason, an optional client-generated sessionId) applied as an atomic op
// batch. Everything — shape validation, "$N" op references, the outer
// transaction — lives in the domain layer (todos/apply.ts, todos/apply-ops.ts);
// this handler only translates HTTP, same discipline as the other routes.
// Errors bubble to the central handler in server.ts: a ValidationError or
// NotFoundError from any op rolls back the whole batch and returns 400/404.

export const applyRoutes: Route[] = [
  {
    method: "POST",
    pattern: "/api/apply",
    handler: async (req, res) => {
      sendJson(res, 200, applyBatch(await readJsonBody(req)));
    },
  },
];
