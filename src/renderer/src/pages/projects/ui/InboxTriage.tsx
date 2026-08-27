import { useState } from "react";
import { requireTodosApi, todoErrorMessage, useTodoStore } from "@/src/entities/todo";
import { ProjectSelect } from "@/src/entities/project/client";
import { AddTodoForm, TodoRow } from "@/src/features/manage-todo/client";

// Emptying the inbox is step one of the weekly review: every item gets a
// project, a date, or a delete. The project picker is inline because that is
// the decision being made here; the date and the delete live in the row's own
// edit dialog, one click further, because they are the less common outcomes.
export function InboxTriage() {
  const inbox = useTodoStore((s) => s.inbox);
  const currentDay = useTodoStore((s) => s.currentDay);
  const [error, setError] = useState<string | null>(null);

  // A filing that fails has to say so: the picker shows the chosen project
  // until the next broadcast snaps it back, so a silent failure reads as a
  // filed item and the sweep moves on believing the inbox is emptier than it
  // is. Same setError path as ProjectStatusSelect and ProjectForm.
  const file = async (todoId: string, projectId: string | null) => {
    setError(null);
    try {
      await requireTodosApi().update(todoId, { projectId });
    } catch (err) {
      setError(todoErrorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Unfiled capture. Give each one a project, a day, or a delete.
        </p>
      </header>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

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
                  onChange={(projectId) => void file(todo.id, projectId)}
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
