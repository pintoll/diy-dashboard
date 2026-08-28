import { useState } from "react";
import { requireProjectsApi, type Project } from "@/src/entities/project";
import { todoErrorMessage } from "@/src/entities/todo";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/ui/select";

type Props = {
  project: Project;
};

// Demote, finish, archive — the weekly review's whole vocabulary, one click
// deep. Deliberately on the pane rather than behind the edit dialog: the sweep
// is meant to be fast enough that it actually happens.
const LABELS: Record<Project["status"], string> = {
  active: "Active",
  someday: "Someday",
  done: "Done",
  archived: "Archived",
};

export function ProjectStatusSelect({ project }: Props) {
  const [error, setError] = useState<string | null>(null);

  const change = (status: string) => {
    setError(null);
    requireProjectsApi()
      .update(project.id, { status: status as Project["status"] })
      .catch((err) => setError(todoErrorMessage(err)));
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Select value={project.status} onValueChange={change}>
        <SelectTrigger className="h-8 w-32 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(LABELS) as Project["status"][]).map((status) => (
            <SelectItem key={status} value={status}>
              {LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
