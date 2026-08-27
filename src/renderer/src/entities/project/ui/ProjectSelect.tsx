import { useEffect, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/ui/select";
import { useProjectStore } from "../model/use-project-store";

// Radix rejects an empty string as an item value, so "unfiled" needs a
// sentinel. Project ids are nanoids (21 chars from a URL-safe alphabet), so
// this can never collide with a real one.
const NONE = "none";

type Props = {
  value: string | null;
  onChange: (projectId: string | null) => void;
  placeholder?: string;
};

/**
 * Files a todo under a project — the only project control Phase 1 puts on the
 * todo surface. Archived projects are hidden, except the one already selected:
 * dropping it from the list would render the trigger blank and read as if the
 * todo were unfiled.
 */
export function ProjectSelect({ value, onChange, placeholder = "No project" }: Props) {
  const projects = useProjectStore((s) => s.projects);
  const ensureLoaded = useProjectStore((s) => s.ensureLoaded);

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  const options = useMemo(
    () => projects.filter((p) => p.status !== "archived" || p.id === value),
    [projects, value]
  );

  return (
    <Select
      value={value ?? NONE}
      onValueChange={(next) => onChange(next === NONE ? null : next)}
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
