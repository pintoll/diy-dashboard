export type {
  Project,
  ProjectInput,
  ProjectUpdatePatch,
  ProjectFilter,
  ProjectBacklog,
  ProjectStats,
  ProjectTime,
  ProjectTimeIndex,
  ProjectDoc,
  ProjectDocInput,
  ProjectDocUpdatePatch,
  ProjectsApi,
} from "./model/project.types";

export { NO_BRIDGE_MESSAGE, requireProjectsApi } from "./model/project.types";

export { STALE_AFTER_DAYS, isStale } from "@shared/project-stale";

export { useProjectStore, acquireProjects, statsOf } from "./model/use-project-store";

export {
  useProjectTimeStore,
  acquireProjectTime,
  EMPTY_PROJECT_TIME,
} from "./model/use-project-time-store";

export {
  useProjectDetailStore,
  acquireProjectDetail,
} from "./model/use-project-detail-store";
