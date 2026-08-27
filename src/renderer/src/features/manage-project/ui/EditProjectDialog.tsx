import { useState } from "react";
import { requireProjectsApi, type Project } from "@/src/entities/project";
import { todoErrorMessage } from "@/src/entities/todo";
import { Button } from "@/src/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/shared/ui/dialog";
import { toProjectPatch } from "../lib/project-form-values";
import { ProjectForm } from "./ProjectForm";

type Props = {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Called after a delete, so the page can drop its selection.
  onDeleted?: () => void;
};

// Deleting is deliberately two clicks and spells out what it costs. Archiving
// is the recommended retirement — it keeps the history, which is the point of
// the archive (docs/design/projects-para.md).
function DeleteControl({
  project,
  onDeleted,
}: {
  project: Project;
  onDeleted: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await requireProjectsApi().remove(project.id);
      onDeleted();
    } catch (err) {
      setError(todoErrorMessage(err));
      setBusy(false);
    }
  };

  if (!armed) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive"
        onClick={() => setArmed(true)}
      >
        Delete
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">
        Its todos survive, unfiled. Its notes are removed for good.
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={remove}
          disabled={busy}
        >
          Delete anyway
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setArmed(false)}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function EditProjectDialog({ project, open, onOpenChange, onDeleted }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
        </DialogHeader>
        {/* Remount on open so a reopened dialog starts from stored values. */}
        {open && (
          <ProjectForm
            key={project.id}
            initial={{
              title: project.title,
              kind: project.kind,
              outcome: project.outcome ?? "",
              targetDate: project.targetDate ?? "",
            }}
            submitLabel="Save"
            onSubmit={async (values) => {
              await requireProjectsApi().update(project.id, toProjectPatch(values));
              onOpenChange(false);
            }}
            footerStart={
              <DeleteControl
                project={project}
                onDeleted={() => {
                  onOpenChange(false);
                  onDeleted?.();
                }}
              />
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
