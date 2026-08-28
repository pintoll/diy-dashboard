import {
  createProjectDoc,
  deleteProjectDoc,
  listProjectDocs,
  updateProjectDoc,
} from "../todos/project-docs";
import { listProjectStats } from "../todos/project-stats";
import {
  asProjectStatus,
  createProject,
  deleteProject,
  listProjectTodos,
  listProjects,
  updateProject,
} from "../todos/projects";
import type {
  ProjectCreateInput,
  ProjectDocCreateInput,
  ProjectDocPatch,
  ProjectPatch,
} from "../todos/types";
import {
  PROJECT_CREATE_KEYS,
  PROJECT_DOC_CREATE_KEYS,
  PROJECT_DOC_PATCH_KEYS,
  PROJECT_PATCH_KEYS,
} from "../todos/validate";
import { agentDeleteContext, readAgentWrite } from "./request";
import { sendJson, type Route } from "./router";

// The steering surface of the agent API (docs/design/projects-para.md). Same
// contract as todos-routes.ts: handlers only translate HTTP <-> the domain
// functions IPC also calls, so validation and journaling cannot fork per
// surface, and key policy comes from todos/validate.ts.
//
// Nothing here executes work. Pulling a project's backlog item onto a day is an
// ordinary PATCH /api/todos/:id — projects must never become a second
// execution surface.

export const projectsRoutes: Route[] = [
  {
    method: "GET",
    pattern: "/api/projects",
    handler: (_req, res, _params, query) => {
      const status = query.get("status");
      const projects =
        status === null ? listProjects() : listProjects({ status: asProjectStatus(status) });
      sendJson(res, 200, { projects });
    },
  },
  {
    // The steering glance in one call: progress, invested time, open backlog,
    // last activity, the next action and the stale verdict for every project.
    // Reading it per project would be one round trip each, which is what a
    // glance cannot afford. Derived state — no reason, no journal — and the
    // literal path is registered ahead of the `:id` routes so a later
    // GET /api/projects/:id could not shadow it.
    method: "GET",
    pattern: "/api/projects/stats",
    handler: (_req, res) => {
      sendJson(res, 200, { stats: listProjectStats() });
    },
  },
  {
    method: "POST",
    pattern: "/api/projects",
    handler: async (req, res) => {
      const { input, ctx } = await readAgentWrite<ProjectCreateInput>(
        req,
        PROJECT_CREATE_KEYS
      );
      sendJson(res, 201, { project: createProject(input, ctx) });
    },
  },
  {
    method: "PATCH",
    pattern: "/api/projects/:id",
    handler: async (req, res, params) => {
      const { input, ctx } = await readAgentWrite<ProjectPatch>(req, PROJECT_PATCH_KEYS);
      sendJson(res, 200, { project: updateProject(params.id, input, ctx) });
    },
  },
  {
    // Archiving is the recommended way to retire a project — it keeps the
    // history a retrospective wants — but a mistyped one has to be removable.
    // Deleting detaches its todos (they survive, unfiled) and removes its docs,
    // every consequence journaled.
    method: "DELETE",
    pattern: "/api/projects/:id",
    handler: (_req, res, params, query) => {
      deleteProject(params.id, agentDeleteContext(query));
      sendJson(res, 204, undefined);
    },
  },
  {
    // A project's undated open work in pull order, plus what it finished. Dated
    // open todos are absent by design: they live on their day.
    method: "GET",
    pattern: "/api/projects/:id/todos",
    handler: (_req, res, params) => {
      sendJson(res, 200, listProjectTodos(params.id));
    },
  },
  {
    method: "GET",
    pattern: "/api/projects/:id/docs",
    handler: (_req, res, params) => {
      sendJson(res, 200, { docs: listProjectDocs(params.id) });
    },
  },
  {
    method: "POST",
    pattern: "/api/projects/:id/docs",
    handler: async (req, res, params) => {
      const { input, ctx } = await readAgentWrite<ProjectDocCreateInput>(
        req,
        PROJECT_DOC_CREATE_KEYS
      );
      sendJson(res, 201, { doc: createProjectDoc(params.id, input, ctx) });
    },
  },
  {
    // Docs are addressed directly, not under their project: an id identifies
    // one doc globally, and nesting would invite a mismatched pair.
    // `append` adds a line (the evening ritual's worklog write); `body`
    // replaces. The two are mutually exclusive — 400 if both.
    method: "PATCH",
    pattern: "/api/docs/:id",
    handler: async (req, res, params) => {
      const { input, ctx } = await readAgentWrite<ProjectDocPatch>(
        req,
        PROJECT_DOC_PATCH_KEYS
      );
      sendJson(res, 200, { doc: updateProjectDoc(params.id, input, ctx) });
    },
  },
  {
    method: "DELETE",
    pattern: "/api/docs/:id",
    handler: (_req, res, params, query) => {
      deleteProjectDoc(params.id, agentDeleteContext(query));
      sendJson(res, 204, undefined);
    },
  },
];
