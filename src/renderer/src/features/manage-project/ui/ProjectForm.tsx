import { useState, type FormEvent, type ReactNode } from "react";
import { todoErrorMessage } from "@/src/entities/todo";
import { Button } from "@/src/shared/ui/button";
import { Field } from "@/src/shared/ui/field";
import { Input } from "@/src/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/ui/select";
import { Textarea } from "@/src/shared/ui/textarea";
import type { ProjectFormValues } from "../lib/project-form-values";

// The fields a project and an area share, in one form so the create and edit
// dialogs cannot drift apart. Status is not here: it is a one-click move on the
// pane itself (ProjectStatusSelect), not something to open a dialog for.

type Props = {
  initial: ProjectFormValues;
  submitLabel: string;
  onSubmit: (values: ProjectFormValues) => Promise<void>;
  // Rendered on the left of the footer — the edit dialog's delete control.
  footerStart?: ReactNode;
};

export function ProjectForm({ initial, submitLabel, onSubmit, footerStart }: Props) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof ProjectFormValues>(
    key: K,
    value: ProjectFormValues[K]
  ) => setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (values.title.trim().length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(todoErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Title">
        <Input
          value={values.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Ship the projects layer"
          autoFocus
        />
      </Field>

      <Field
        label="Kind"
        hint={
          values.kind === "area"
            ? "An area has no end — a standing responsibility to keep healthy."
            : "A project has an end. Outcome and target date describe it."
        }
      >
        <Select
          value={values.kind}
          onValueChange={(next) => set("kind", next as ProjectFormValues["kind"])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="project">Project</SelectItem>
            <SelectItem value="area">Area</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label="Outcome" hint="One line: what done means.">
        <Textarea
          value={values.outcome}
          onChange={(e) => set("outcome", e.target.value)}
          placeholder="Optional"
          className="max-h-32 min-h-16"
        />
      </Field>

      <Field label="Target date" hint="A soft marker. Nothing notifies off it.">
        <Input
          type="date"
          value={values.targetDate}
          onChange={(e) => set("targetDate", e.target.value)}
        />
      </Field>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        <div>{footerStart}</div>
        <Button type="submit" size="sm" disabled={busy || values.title.trim().length === 0}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
