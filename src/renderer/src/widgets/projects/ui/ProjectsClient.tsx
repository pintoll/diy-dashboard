import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { acquireProjects, useProjectStore } from "@/src/entities/project";
import { useTodoStore } from "@/src/entities/todo";
import { buildSteeringRows } from "../lib/steering-rows";
import { ProjectSteeringRow } from "./ProjectSteeringRow";

export type ProjectsConfig = Record<string, never>;

// The steering glance (docs/design/projects-para.md): which projects are moving
// and which are rotting, read once or twice a day. Management lives on
// /projects — a title here is a link there, not a second place to run a review.
export function ProjectsClient() {
  const projects = useProjectStore((s) => s.projects);
  const stats = useProjectStore((s) => s.stats);
  const status = useProjectStore((s) => s.status);
  const error = useProjectStore((s) => s.error);
  const currentDay = useTodoStore((s) => s.currentDay);

  // Loads the project list, and on the last card's unmount releases it so the
  // module-scope change subscription stops refreshing a store nothing reads.
  useEffect(() => acquireProjects(), []);

  const rows = useMemo(
    () => buildSteeringRows(projects, stats, currentDay),
    [projects, stats, currentDay]
  );
  const staleCount = rows.filter((row) => row.stale).length;

  // A full-pane error only when there is nothing renderable; once the card has
  // rows, a failed background refresh degrades to the inline note below and the
  // last good glance stays on screen (the day sheet's convention).
  if (status === "error" && rows.length === 0) {
    return (
      <p className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
        {error}
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-1.5">
      {status === "error" && (
        <p className="shrink-0 px-2 text-[10px] text-destructive">{error}</p>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {rows.length === 0
          ? status === "ready" && (
              <p className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
                No active projects.
              </p>
            )
          : rows.map((row) => (
              <ProjectSteeringRow key={row.project.id} row={row} pullTo={currentDay} />
            ))}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 px-2">
        <span className="text-[10px] text-muted-foreground">
          {rows.length === 0
            ? "Nothing to steer"
            : `${rows.length} active${staleCount > 0 ? ` · ${staleCount} stale` : ""}`}
        </span>
        <Link
          to="/projects"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Projects
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
