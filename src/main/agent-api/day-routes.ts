import { today } from "@shared/day";
import { assertDate } from "../todos/date";
import { foldDay, getDayFold, resolveYesterday } from "../todos/fold";
import {
  createPlanEntry,
  deletePlanEntry,
  listPlanEntries,
  updatePlanEntry,
} from "../todos/plan";
import type { PlanEntryCreateInput, PlanEntryPatch } from "../todos/types";
import { readJsonBody, sendJson, type Route } from "./router";
import { agentReason, asObject } from "./todos-routes";

// The day-record surface of the agent API: the plan (todos penciled onto
// clock-time ranges) and the fold (the day's closed record). Same discipline
// as todos-routes: handlers only translate HTTP <-> the domain functions the
// assistant loop will later call in-process, and errors bubble to the central
// handler in server.ts.
//
// Times are "HH:MM" on the 05:00 day: a time below "05:00" means the small
// hours of the next calendar day (docs/spec/todos-agent-api.md).

export const dayRoutes: Route[] = [
  {
    method: "GET",
    pattern: "/api/plan",
    handler: (_req, res, _params, query) => {
      const date = query.get("date");
      sendJson(res, 200, { entries: listPlanEntries(date ?? today()) });
    },
  },
  {
    method: "POST",
    pattern: "/api/plan",
    handler: async (req, res) => {
      const body = asObject(await readJsonBody(req), "body");
      const reason = agentReason(body.reason);
      delete body.reason;
      const entry = createPlanEntry(body as PlanEntryCreateInput, {
        source: "agent",
        reason,
      });
      sendJson(res, 201, { entry });
    },
  },
  {
    method: "PATCH",
    pattern: "/api/plan/:id",
    handler: async (req, res, params) => {
      const body = asObject(await readJsonBody(req), "body");
      const reason = agentReason(body.reason);
      delete body.reason;
      const entry = updatePlanEntry(params.id, body as PlanEntryPatch, {
        source: "agent",
        reason,
      });
      sendJson(res, 200, { entry });
    },
  },
  {
    method: "DELETE",
    pattern: "/api/plan/:id",
    // DELETE reads no body, so the reason travels as a query param.
    handler: (_req, res, params, query) => {
      const reason = agentReason(query.get("reason"));
      deletePlanEntry(params.id, { source: "agent", reason });
      sendJson(res, 204, undefined);
    },
  },
  // "Yesterday" in the assistant's sense: the last day before today with
  // records (plan entries or ops) after the last fold — null when history is
  // fully folded. Its own route so fold calls always name a literal day.
  {
    method: "GET",
    pattern: "/api/yesterday",
    handler: (_req, res) => {
      sendJson(res, 200, { date: resolveYesterday() });
    },
  },
  {
    method: "GET",
    pattern: "/api/days/:day",
    handler: (_req, res, params) => {
      const day = assertDate(params.day, "day");
      sendJson(res, 200, {
        day,
        plan: listPlanEntries(day),
        fold: getDayFold(day),
      });
    },
  },
  {
    method: "POST",
    pattern: "/api/days/:day/fold",
    // No reason field: folds are not journaled — remarks is the NL payload.
    // An empty body is a valid fold (snapshot only, remarks kept).
    handler: async (req, res, params) => {
      const raw = await readJsonBody(req);
      const body = raw === undefined ? {} : asObject(raw, "body");
      const fold = foldDay(params.day, {
        remarks: body.remarks as string | null | undefined,
      });
      sendJson(res, 200, { fold });
    },
  },
];
