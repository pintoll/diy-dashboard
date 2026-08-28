import { useEffect, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/ui/select";
import { acquireProjects, useProjectStore } from "../model/use-project-store";

// Radix rejects an empty string as an item value, so "unfiled" needs a
// sentinel. Project ids are nanoids (21 chars from a URL-safe alphabet), so
// this can never collide with a real one.
const NONE = "none";

type Props = {
  value: string | null;
  onChange: (projectId: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * Files a todo under a project — the only project control Phase 1 puts on the
 * todo surface. Archived projects are hidden, except the one already selected:
 * dropping it from the list would render the trigger blank and read as if the
 * todo were unfiled.
 */
export function ProjectSelect({
  value,
  onChange,
  placeholder = "No project",
  disabled = false,
}: Props) {
  const projects = useProjectStore((s) => s.projects);

  // Acquire rather than a bare ensureLoaded: the list is only worth keeping
  // warm while a picker is on screen.
  useEffect(() => acquireProjects(), []);

  const options = useMemo(
    () => projects.filter((p) => p.status !== "archived" || p.id === value),
    [projects, value]
  );

  return (
    <Select
      value={value ?? NONE}
      onValueChange={(next) => onChange(next === NONE ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {options.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            {project.kind === "area" ? `${project.title} · area` : project.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
