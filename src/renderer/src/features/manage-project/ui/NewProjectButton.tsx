import { useState } from "react";
import { Plus } from "lucide-react";
import { requireProjectsApi } from "@/src/entities/project";
import { Button } from "@/src/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/shared/ui/dialog";
import { toProjectPatch } from "../lib/project-form-values";
import { ProjectForm } from "./ProjectForm";

type Props = {
  // Called with the new project's id, so the page can select what was created.
  onCreated?: (projectId: string) => void;
};

export function NewProjectButton({ onCreated }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus />
        New project
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              A project has an end; an area doesn&apos;t. Both start with an
              empty notes doc.
            </DialogDescription>
          </DialogHeader>
          {/* Remount on open so a reopened dialog starts blank. */}
          {open && (
            <ProjectForm
              initial={{ title: "", kind: "project", outcome: "", targetDate: "" }}
              submitLabel="Create"
              onSubmit={async (values) => {
                const project = await requireProjectsApi().create(
                  toProjectPatch(values)
                );
                setOpen(false);
                onCreated?.(project.id);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
