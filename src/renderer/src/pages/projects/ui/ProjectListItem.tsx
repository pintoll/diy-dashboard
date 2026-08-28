import { CircleSlash, Clock } from "lucide-react";
import { formatShortDate, useTodoStore } from "@/src/entities/todo";
import {
  STALE_AFTER_DAYS,
  isStale,
  statsOf,
  useProjectStore,
  type Project,
} from "@/src/entities/project";
import { cn } from "@/src/shared/lib/utils";

type Props = {
  project: Project;
  selected: boolean;
  onSelect: () => void;
};

// One line of the steering glance. Everything on it answers "is this moving?",
// which is why it carries a last-activity date rather than a progress bar: a
// project can be 80% done and dead.
export function ProjectListItem({ project, selected, onSelect }: Props) {
  const stats = useProjectStore((s) => statsOf(s.stats, project.id));
  const currentDay = useTodoStore((s) => s.currentDay);

  const stale = isStale(project, stats.lastActivityDay, currentDay);
  // Only worth saying for something that is supposed to be moving. An active
  // project with nothing pullable is dead in a way no date shows.
  const noNextAction =
    project.status === "active" && project.kind === "project" && stats.openBacklog === 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors",
        selected ? "bg-accent" : "hover:bg-accent/50"
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className={cn("truncate text-sm", selected && "font-medium")}>
          {project.title}
        </span>
        {stale && (
          <span
            className="shrink-0 rounded-sm bg-amber-500/15 px-1 text-[10px] font-medium text-amber-600 dark:text-amber-400"
            title={`Nothing has moved here in ${STALE_AFTER_DAYS} days or more`}
          >
            stale
          </span>
        )}
      </span>
      <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-0.5">
          <Clock className="size-2.5" />
          {stats.lastActivityDay === null
            ? "no activity"
            : formatShortDate(stats.lastActivityDay)}
        </span>
        {noNextAction && (
          <span className="inline-flex items-center gap-0.5" title="Nothing to pull">
            <CircleSlash className="size-2.5" />
            no next action
          </span>
        )}
      </span>
    </button>
  );
}
