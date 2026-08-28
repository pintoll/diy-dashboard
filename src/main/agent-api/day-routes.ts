import { today } from "@shared/day";
import { assertDate } from "../todos/date";
import { foldDay, getDayFold, resolveYesterday } from "../todos/fold";
import { getDayLog } from "../todos/log";
import {
  createPlanEntry,
  deletePlanEntry,
  listPlanEntries,
  updatePlanEntry,
} from "../todos/plan";
import type { PlanEntryCreateInput, PlanEntryPatch } from "../todos/types";
import { asObject, PLAN_CREATE_KEYS, PLAN_PATCH_KEYS } from "../todos/validate";
import { agentDeleteContext, readAgentWrite } from "./request";
import { readJsonBody, sendJson, type Route } from "./router";

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
    // Strict keys: "date" (the name GET /api/plan and the todo routes use)
    // must 400 here, not silently fall back to planning today under the
    // spec's name "day".
    handler: async (req, res) => {
      const { input, ctx } = await readAgentWrite<PlanEntryCreateInput>(
        req,
        PLAN_CREATE_KEYS
      );
      sendJson(res, 201, { entry: createPlanEntry(input, ctx) });
    },
  },
  {
    method: "PATCH",
    pattern: "/api/plan/:id",
    // Retiming only: re-pointing ("todoId") or moving days ("day") is
    // delete+create per the spec, so those keys must 400, not no-op into a
    // 200 the caller reads as a successful move.
    handler: async (req, res, params) => {
      const { input, ctx } = await readAgentWrite<PlanEntryPatch>(req, PLAN_PATCH_KEYS);
      sendJson(res, 200, { entry: updatePlanEntry(params.id, input, ctx) });
    },
  },
  {
    method: "DELETE",
    pattern: "/api/plan/:id",
    handler: (_req, res, params, query) => {
      deletePlanEntry(params.id, agentDeleteContext(query));
      sendJson(res, 204, undefined);
    },
  },
  // "Yesterday" in the assistant's sense: the last day before today with
  // records (plan entries, ops, or pomodoro sessions) after the last fold —
  // null when history is fully folded. Its own route so fold calls always
  // name a literal day.
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
  // The day record's third part: the ops journal rendered to natural language
  // at read time (one line per reason; direct edits mechanical). Read-only —
  // the window is over when the ops HAPPENED, not the days they touch.
  {
    method: "GET",
    pattern: "/api/days/:day/log",
    handler: (_req, res, params) => {
      sendJson(res, 200, getDayLog(params.day));
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
