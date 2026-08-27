import { useState } from "react";
import { Inbox } from "lucide-react";
import { useProjectStore } from "@/src/entities/project";
import { useTodoStore } from "@/src/entities/todo";
import { cn } from "@/src/shared/lib/utils";
import { SectionToggle } from "@/src/shared/ui/section-header";
import { groupProjects, type ProjectSection } from "../lib/group-projects";
import { ProjectListItem } from "./ProjectListItem";

type Props = {
  selectedId: string | null;
  onSelect: (projectId: string | null) => void;
};

function Section({
  section,
  selectedId,
  onSelect,
}: {
  section: ProjectSection;
  selectedId: string | null;
  onSelect: (projectId: string) => void;
}) {
  const [open, setOpen] = useState(!section.collapsed);
  // An empty working section still shows its header — a missing "Active" would
  // read as a bug rather than as "nothing is active".
  if (section.collapsed && section.projects.length === 0) return null;

  return (
    <section className="flex flex-col gap-0.5">
      <SectionToggle
        open={open}
        onToggle={() => setOpen((value) => !value)}
        size="sm"
        className="py-1"
      >
        {section.label} · {section.projects.length}
      </SectionToggle>
      {open &&
        section.projects.map((project) => (
          <ProjectListItem
            key={project.id}
            project={project}
            selected={project.id === selectedId}
            onSelect={() => onSelect(project.id)}
          />
        ))}
    </section>
  );
}

// The steering glance: the inbox at the top because an unemptied intake bin is
// the first thing a review has to fix, then the projects in the order the
// design doc lays out (docs/design/projects-para.md).
export function ProjectList({ selectedId, onSelect }: Props) {
  const projects = useProjectStore((s) => s.projects);
  const inboxCount = useTodoStore((s) => s.inbox.length);
  const sections = groupProjects(projects);

  return (
    <nav className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          selectedId === null ? "bg-accent font-medium" : "hover:bg-accent/50"
        )}
      >
        <Inbox className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1">Inbox</span>
        {inboxCount > 0 && (
          <span className="rounded-sm bg-muted px-1.5 text-[10px] text-muted-foreground">
            {inboxCount}
          </span>
        )}
      </button>

      {sections.map((section) => (
        <Section
          key={section.key}
          section={section}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
}
