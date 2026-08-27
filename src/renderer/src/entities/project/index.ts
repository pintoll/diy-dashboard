export type {
  Project,
  ProjectInput,
  ProjectUpdatePatch,
  ProjectFilter,
  ProjectBacklog,
  ProjectStats,
  ProjectDoc,
  ProjectDocInput,
  ProjectDocUpdatePatch,
  ProjectsApi,
} from "./model/project.types";

export { NO_BRIDGE_MESSAGE, requireProjectsApi } from "./model/project.types";

export { useProjectStore, statsOf } from "./model/use-project-store";

export {
  useProjectDetailStore,
  acquireProjectDetail,
} from "./model/use-project-detail-store";
