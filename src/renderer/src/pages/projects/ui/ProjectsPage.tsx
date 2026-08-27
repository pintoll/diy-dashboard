import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  acquireProjectDetail,
  acquireProjects,
  useProjectDetailStore,
  useProjectStore,
} from "@/src/entities/project";
import { useTodoStore } from "@/src/entities/todo";
import { NewProjectButton } from "@/src/features/manage-project/client";
import { Card, CardContent } from "@/src/shared/ui/card";
import { InboxTriage } from "./InboxTriage";
import { ProjectList } from "./ProjectList";
import { ProjectPane } from "./ProjectPane";

// PARA's home (docs/design/projects-para.md): management and review, not
// execution. Nothing here starts work — the only path from a project into doing
// is pulling one of its backlog items onto a day.
export function ProjectsPage() {
  const projectStatus = useProjectStore((s) => s.status);
  const projectError = useProjectStore((s) => s.error);
  const projects = useProjectStore((s) => s.projects);

  const ensureTodos = useTodoStore((s) => s.ensureLoaded);

  const selectedId = useProjectDetailStore((s) => s.selectedId);
  const select = useProjectDetailStore((s) => s.select);

  const [searchParams, setSearchParams] = useSearchParams();

  // Selection is deliberately not persisted: the page is opened to review, and
  // reopening on the inbox is the review's first step either way — which is
  // what acquireProjectDetail's release clears on the way out. A `?project=`
  // deep link (the widget's title link) is the stated exception, handled below.
  useEffect(() => {
    // The inbox pane and every backlog row read the todo store.
    void ensureTodos();
    const releaseProjects = acquireProjects();
    const releaseDetail = acquireProjectDetail();
    return () => {
      releaseDetail();
      releaseProjects();
    };
  }, [ensureTodos]);

  // Arriving from the projects widget, which names the project it was clicked
  // on. Consumed once and stripped from the URL, so a later manual selection is
  // not fought by a stale param on the next render. Runs after the effect above
  // so the acquire's refresh has already gone out for the inbox. A project id
  // that no longer exists falls back to the inbox via the guard below.
  useEffect(() => {
    const target = searchParams.get("project");
    if (target === null) return;
    setSearchParams({}, { replace: true });
    void select(target);
  }, [searchParams, setSearchParams, select]);

  // A project the user deleted, or one archived away, must not leave the right
  // pane rendering a row that no longer exists.
  useEffect(() => {
    if (projectStatus !== "ready" || selectedId === null) return;
    if (!projects.some((p) => p.id === selectedId)) void select(null);
  }, [projectStatus, projects, selectedId, select]);

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
        <header className="flex items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <NewProjectButton onCreated={(id) => void select(id)} />
        </header>

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Todos answer &ldquo;finish today&rdquo;. This answers whether the
            right work is moving at all.
          </p>
        </div>

        {projectStatus === "error" && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {projectError}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-[15rem_1fr] md:items-start">
          <Card className="md:sticky md:top-8">
            <CardContent className="px-2 py-3">
              <ProjectList selectedId={selectedId} onSelect={(id) => void select(id)} />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              {selected ? (
                <ProjectPane
                  key={selected.id}
                  project={selected}
                  onDeleted={() => void select(null)}
                />
              ) : (
                <InboxTriage />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
