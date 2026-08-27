import { Link } from "react-router-dom";
import { CalendarPlus, Clock } from "lucide-react";
import { STALE_AFTER_DAYS } from "@/src/entities/project";
import { formatShortDate, requireTodosApi } from "@/src/entities/todo";
import { Button } from "@/src/shared/ui/button";
import { cn } from "@/src/shared/lib/utils";
import type { SteeringRow } from "../lib/steering-rows";

type Props = {
  row: SteeringRow;
  // The day the pull button moves the next action to.
  pullTo: string;
};

// Errors are not surfaced inline: the todos:changed push refreshes the store
// either way, so the row snaps back to the truth (TodoRow's convention).
function run(action: Promise<unknown>): void {
  action.catch((error) => console.warn("project action failed:", error));
}

// One project's answer to "is this moving?" — progress, when it last moved, and
// the one thing that would move it next. The title opens the project on the
// page; the only thing acted on here is the pull, which is the sole path a
// project has into doing (docs/design/projects-para.md).
export function ProjectSteeringRow({ row, pullTo }: Props) {
  const { project, stats, stale, pct, lastActivityLabel } = row;
  const nextAction = stats.nextAction;

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/50",
        stale && "opacity-70"
      )}
    >
      <div className="flex items-center gap-1.5">
        <Link
          to={`/projects?project=${encodeURIComponent(project.id)}`}
          className="truncate text-xs font-medium transition-colors hover:text-primary"
        >
          {project.title}
        </Link>
        {stale && (
          <span
            className="shrink-0 rounded-sm bg-amber-500/15 px-1 text-[9px] font-medium text-amber-600 dark:text-amber-400"
            title={`Nothing has moved here in ${STALE_AFTER_DAYS} days or more`}
          >
            stale
          </span>
        )}
        <span className="ml-auto shrink-0 text-[9px] tabular-nums text-muted-foreground">
          {stats.total === 0 ? "empty" : `${stats.done}/${stats.total}`}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-[9px] text-muted-foreground">
          <Clock className="size-2.5" />
          {lastActivityLabel}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {nextAction === null ? (
          <span className="truncate text-[10px] italic text-muted-foreground">
            no next action
          </span>
        ) : (
          <>
            <span className="truncate text-[10px] text-muted-foreground">
              {nextAction.title}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              className="ml-auto shrink-0"
              aria-label={`Move "${nextAction.title}" to ${formatShortDate(pullTo)}`}
              title={`Move to ${formatShortDate(pullTo)}`}
              onClick={() =>
                run(requireTodosApi().update(nextAction.id, { date: pullTo }))
              }
            >
              <CalendarPlus />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
