import { useEffect, useState, type FormEvent } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import {
  requireProjectsApi,
  useProjectDetailStore,
  type ProjectDoc,
} from "@/src/entities/project";
import { todoErrorMessage } from "@/src/entities/todo";
import { sqliteUtcToMs } from "@shared/sqlite-time";
import { registerFlushOnQuit } from "@/src/shared/lib/flush-on-quit";
import { formatMsAgo } from "@/src/shared/lib/format-time-ago";
import { Button } from "@/src/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/shared/ui/dropdown-menu";
import { Input } from "@/src/shared/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/src/shared/ui/tabs";
import { Textarea } from "@/src/shared/ui/textarea";

// A project's prose — why, decisions, facts found mid-work, current state.
// Rendered as a plain textarea on purpose: the discipline that keeps these
// useful is that the doc holds *context* and the backlog holds *actions*
// (docs/design/projects-para.md), and a richer editor would only invite the
// note to grow a second todo list.
//
// History comes from the ops journal on the main side, so there is nothing to
// keep here but the buffer; the store owns that, along with the debounce.

const MAX_DOC_TITLE = 100;

function TitleForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: string;
  submitLabel: string;
  onSubmit: (title: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (title.trim().length === 0 || busy) return;
    setBusy(true);
    try {
      await onSubmit(title.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-1">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        maxLength={MAX_DOC_TITLE}
        placeholder="Doc name"
        className="h-7 w-36 text-xs"
        autoFocus
      />
      <Button type="submit" size="xs" disabled={busy || title.trim().length === 0}>
        {submitLabel}
      </Button>
      <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

export function ProjectDocsEditor({ projectId }: { projectId: string }) {
  const docs = useProjectDetailStore((s) => s.docs);
  const activeDocId = useProjectDetailStore((s) => s.activeDocId);
  const setActiveDoc = useProjectDetailStore((s) => s.setActiveDoc);
  const editDoc = useProjectDetailStore((s) => s.editDoc);
  const flush = useProjectDetailStore((s) => s.flush);

  const [mode, setMode] = useState<"idle" | "adding" | "renaming">("idle");
  const [error, setError] = useState<string | null>(null);

  // Closing the window only hides it to the tray, so unmount never runs on the
  // way out and the debounce would take the last edit with it.
  useEffect(() => registerFlushOnQuit(flush), [flush]);
  // Switching projects unmounts this; the store's pending write must land.
  useEffect(() => () => void flush(), [flush]);

  const active: ProjectDoc | undefined =
    docs.find((doc) => doc.id === activeDocId) ?? docs[0];
  // updated_at is a SQLite CURRENT_TIMESTAMP: zoneless UTC, and reading it
  // naively would pin this label to "just now" forever.
  const savedMs = active ? sqliteUtcToMs(active.updatedAt) : null;

  // Every doc action settles here, and the returned promise never rejects: the
  // failure has already been rendered, and a second rejection travelling on to
  // a form's submit handler would only surface as an unhandled one.
  const run = (action: Promise<unknown>): Promise<void> => {
    setError(null);
    return action.then(
      () => setMode("idle"),
      (err) => setError(todoErrorMessage(err))
    );
  };

  const addDoc = (title: string) =>
    run(
      requireProjectsApi()
        .docs.create(projectId, { title })
        .then((doc) => setActiveDoc(doc.id))
    );

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {mode === "adding" ? (
          <TitleForm
            initial=""
            submitLabel="Add"
            onSubmit={addDoc}
            onCancel={() => setMode("idle")}
          />
        ) : mode === "renaming" && active ? (
          <TitleForm
            initial={active.title}
            submitLabel="Rename"
            onSubmit={(title) =>
              run(requireProjectsApi().docs.update(active.id, { title }))
            }
            onCancel={() => setMode("idle")}
          />
        ) : (
          <Tabs
            value={active?.id ?? ""}
            onValueChange={(next) => void setActiveDoc(next)}
            className="min-w-0 flex-1"
          >
            <TabsList variant="line" className="max-w-full overflow-x-auto">
              {docs.map((doc) => (
                <TabsTrigger key={doc.id} value={doc.id} className="text-xs">
                  {doc.title}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {mode === "idle" && (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setMode("adding")}
              aria-label="Add a doc"
              title="Add a doc"
            >
              <Plus />
            </Button>
            {active && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label="Doc actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setMode("renaming")}>
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    // A project with no doc has nowhere to write its context,
                    // and main would not recreate one.
                    disabled={docs.length <= 1}
                    onSelect={() => void run(requireProjectsApi().docs.remove(active.id))}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>

      {active ? (
        <Textarea
          key={active.id}
          value={active.body}
          onChange={(e) => editDoc(e.target.value)}
          onBlur={() => void flush()}
          placeholder="Why this exists, what was decided, where it stands."
          className="max-h-96 min-h-32 text-sm"
        />
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No docs yet.
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
      {savedMs !== null && (
        <p className="text-right text-[10px] text-muted-foreground">
          Saved {formatMsAgo(savedMs)}
        </p>
      )}
    </section>
  );
}
