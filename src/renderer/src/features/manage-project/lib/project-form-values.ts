import type { ProjectInput } from "@/src/entities/project";

// The form's own shape: every field a string, because that is what an input
// holds. The API wants nullable fields, so the two are not the same type and
// the conversion below is the seam between them.
export type ProjectFormValues = {
  title: string;
  kind: "project" | "area";
  outcome: string;
  targetDate: string;
};

// Every field spelled out, so the result satisfies both `create` (which needs
// a title) and `update` (which needs nothing). Status is not a form field —
// creating always starts active, and changing it is one click on the pane.
type ProjectFields = Required<Omit<ProjectInput, "status">>;

/** Trims the form's strings back into the nullable shape the API expects. */
export function toProjectPatch(values: ProjectFormValues): ProjectFields {
  const outcome = values.outcome.trim();
  return {
    title: values.title.trim(),
    kind: values.kind,
    outcome: outcome.length > 0 ? outcome : null,
    targetDate: values.targetDate.length > 0 ? values.targetDate : null,
  };
}
