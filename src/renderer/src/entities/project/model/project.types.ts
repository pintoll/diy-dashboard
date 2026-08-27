// The renderer-side names for the project domain. These alias the ambient
// interfaces declared in `src/preload/electron-env.d.ts`, which is the IPC
// contract with the main process — same rule as todo.types.ts: aliasing rather
// than re-declaring keeps one definition per shape.

export type Project = ProjectItem;
export type ProjectInput = ProjectCreateInput;
export type ProjectUpdatePatch = ProjectPatch;
export type ProjectFilter = ProjectListFilter;
export type ProjectBacklog = ProjectTodos;
export type ProjectStats = ProjectStatsItem;
export type ProjectDoc = ProjectDocItem;
export type ProjectDocInput = ProjectDocCreateInput;
export type ProjectDocUpdatePatch = ProjectDocPatch;

export type ProjectsApi = ProjectsAPI;

export const NO_BRIDGE_MESSAGE = "Projects are only available in the desktop app";

// Guarded like requireTodosApi: `window.electronAPI` is optional because the
// renderer also boots in a plain browser during `electron-vite dev`.
export function requireProjectsApi(): ProjectsApi {
  const api = window.electronAPI?.projects;
  if (!api) throw new Error(NO_BRIDGE_MESSAGE);
  return api;
}
