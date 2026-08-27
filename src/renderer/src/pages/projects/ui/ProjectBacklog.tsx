import { useProjectDetailStore } from "@/src/entities/project";
import { useTodoStore } from "@/src/entities/todo";
import { AddTodoForm, SortableTodoList } from "@/src/features/manage-todo/client";
import { SectionLabel } from "@/src/shared/ui/section-header";

// The project's next actions, in pull order. The head is the next action; an
// active project with none is effectively dead, which is what the left list's
// marker says out loud.
//
// `date={null}` scopes the reorder to the undated bucket and `pullTo` renders
// the one-click move onto today — the only path from a project into doing.
export function ProjectBacklog({ projectId }: { projectId: string }) {
  const backlog = useProjectDetailStore((s) => s.backlog);
  const currentDay = useTodoStore((s) => s.currentDay);

  return (
    <section className="flex flex-col gap-1">
      <SectionLabel>Backlog · {backlog.length}</SectionLabel>
      {backlog.length === 0 && (
        <p className="px-2 py-3 text-sm text-muted-foreground">
          No next action. An active project with an empty backlog is stalled —
          add the one thing that would move it.
        </p>
      )}
      <SortableTodoList todos={backlog} date={null} pullTo={currentDay} />
      <div className="mt-2 px-2">
        <AddTodoForm
          date={null}
          projectId={projectId}
          placeholder="Add a next action..."
        />
      </div>
    </section>
  );
}
