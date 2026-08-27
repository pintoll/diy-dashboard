import { requireTodosApi, useTodoStore } from "@/src/entities/todo";
import { ProjectSelect } from "@/src/entities/project/client";
import { AddTodoForm, TodoRow } from "@/src/features/manage-todo/client";

// Emptying the inbox is step one of the weekly review: every item gets a
// project, a date, or a delete. The project picker is inline because that is
// the decision being made here; the date and the delete live in the row's own
// edit dialog, one click further, because they are the less common outcomes.
export function InboxTriage() {
  const inbox = useTodoStore((s) => s.inbox);
  const currentDay = useTodoStore((s) => s.currentDay);

  const file = (todoId: string, projectId: string | null) => {
    requireTodosApi()
      .update(todoId, { projectId })
      .catch((error) => console.warn("filing failed:", error));
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Unfiled capture. Give each one a project, a day, or a delete.
        </p>
      </header>

      {inbox.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Inbox zero.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {inbox.map((todo) => (
            <div key={todo.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <TodoRow todo={todo} pullTo={currentDay} />
              </div>
              <div className="w-40 shrink-0">
                <ProjectSelect
                  value={todo.projectId}
                  onChange={(projectId) => file(todo.id, projectId)}
                  placeholder="File under..."
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="px-2">
        <AddTodoForm date={null} placeholder="Capture something..." />
      </div>
    </div>
  );
}
