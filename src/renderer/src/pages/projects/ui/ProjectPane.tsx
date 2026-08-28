import { useState } from "react";
import { Pencil } from "lucide-react";
import {
  useProjectDetailStore,
  type Project,
} from "@/src/entities/project";
import { formatShortDate } from "@/src/entities/todo";
import {
  EditProjectDialog,
  ProjectDocsEditor,
  ProjectStatusSelect,
} from "@/src/features/manage-project/client";
import { Button } from "@/src/shared/ui/button";
import { ProjectBacklog } from "./ProjectBacklog";
import { ProjectCompleted } from "./ProjectCompleted";
import { ProjectProgress } from "./ProjectProgress";
import { ProjectScheduled } from "./ProjectScheduled";

type Props = {
  project: Project;
  onDeleted: () => void;
};

// One project, top to bottom: what it is for, how far it has got, what it
// knows, what it could do next, what it has scheduled, what it has finished.
export function ProjectPane({ project, onDeleted }: Props) {
  const [editing, setEditing] = useState(false);
  const status = useProjectDetailStore((s) => s.status);
  const error = useProjectDetailStore((s) => s.error);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold">{project.title}</h1>
            {project.kind === "area" && (
              <span className="shrink-0 rounded-sm bg-muted px-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                area
              </span>
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setEditing(true)}
              aria-label="Edit project"
            >
              <Pencil />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {project.outcome ??
              (project.kind === "area"
                ? "A standing responsibility, with no end."
                : "No outcome set — what would done look like?")}
          </p>
          {project.targetDate && (
            <p className="text-xs text-muted-foreground">
              Target {formatShortDate(project.targetDate)} · a marker, not a
              deadline
            </p>
          )}
        </div>
        <ProjectStatusSelect project={project} />
      </header>

      <ProjectProgress projectId={project.id} />

      {error && <p className="text-sm text-destructive">{error}</p>}
      {status === "loading" && (
        <p className="text-sm text-muted-foreground">Loading...</p>
      )}

      <ProjectDocsEditor projectId={project.id} />
      <ProjectBacklog projectId={project.id} />
      <ProjectScheduled />
      <ProjectCompleted />

      <EditProjectDialog
        project={project}
        open={editing}
        onOpenChange={setEditing}
        onDeleted={onDeleted}
      />
    </div>
  );
}
