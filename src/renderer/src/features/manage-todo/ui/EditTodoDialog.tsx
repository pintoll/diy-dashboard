import { useState, type FormEvent } from "react";
import { today } from "@shared/day";
import { ProjectSelect } from "@/src/entities/project/client";
import {
  requireTodosApi,
  todoErrorMessage,
  type Todo,
} from "@/src/entities/todo";
import { Button } from "@/src/shared/ui/button";
import { Checkbox } from "@/src/shared/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { Label } from "@/src/shared/ui/label";
import { Textarea } from "@/src/shared/ui/textarea";

type Props = {
  todo: Todo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function EditForm({ todo, onDone }: { todo: Todo; onDone: () => void }) {
  const [title, setTitle] = useState(todo.title);
  const [note, setNote] = useState(todo.note ?? "");
  // A parked todo has no date, but the input still needs a value to fall back
  // to the moment the box is unchecked.
  const [parked, setParked] = useState(todo.date === null);
  const [date, setDate] = useState(todo.date ?? today());
  const [projectId, setProjectId] = useState(todo.projectId);
  // What the dialog opened on, kept so only a deliberate change is sent. The
  // filing this form holds is a snapshot: another writer (the agent API, the
  // other window) can detach the todo or delete the project while the dialog
  // sits open, and resending the stale id would silently re-file the todo — or
  // 404 an unrelated title edit on a project that no longer exists.
  const [openedWith] = useState(todo.projectId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Until the projects page lands (Phase 2 of docs/design/projects-para.md),
  // the only lists in the app are the dated days and the unfiled inbox, so a
  // todo that is both parked and filed would be visible nowhere and reachable
  // only through the agent API. Each control therefore blocks the step that
  // would create that state — never the step out of it, so a todo the agent
  // API already parked and filed can still be freed from here.
  const filed = projectId !== null;
  const wouldVanish = parked && filed;

  // moveBucket goes through here too, so a bucket flip carries a filing the
  // user changed in the same visit — and only then.
  const commit = async (nextDate: string | null) => {
    setBusy(true);
    setError(null);
    try {
      await requireTodosApi().update(todo.id, {
        title: title.trim(),
        note: note.trim().length > 0 ? note.trim() : null,
        date: nextDate,
        ...(projectId !== openedWith ? { projectId } : {}),
      });
      onDone();
    } catch (err) {
      setError(todoErrorMessage(err));
      setBusy(false);
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    void commit(parked ? null : date);
  };

  // The one-click form of the checkbox above: flip the bucket and save, so the
  // common "this can wait indefinitely" move is a single action.
  const moveBucket = () => void commit(parked ? today() : null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await requireTodosApi().remove(todo.id);
      onDone();
    } catch (err) {
      setError(todoErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="todo-title">Title</Label>
        <Input
          id="todo-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="todo-note">Note</Label>
        <Textarea
          id="todo-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional"
          className="max-h-72 min-h-40"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Project</Label>
        <ProjectSelect
          value={projectId}
          onChange={setProjectId}
          disabled={parked && !filed}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="todo-date">Date</Label>
        <div className="flex items-center gap-3">
          {/* Blank while parked, so the field cannot read as "there is a date
              here, it is just greyed out". The state keeps the last value, so
              unchecking restores it rather than leaving an empty input. */}
          <Input
            id="todo-date"
            type="date"
            value={parked ? "" : date}
            disabled={parked}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1"
          />
          <Label className="whitespace-nowrap font-normal text-muted-foreground">
            <Checkbox
              checked={parked}
              disabled={filed && !parked}
              onCheckedChange={(checked) => setParked(checked === true)}
            />
            No date (backlog)
          </Label>
        </div>
        {(parked || filed) && (
          <p className="text-xs text-muted-foreground">
            {wouldVanish
              ? "Parked and filed at once: this todo shows up on no list until the projects page lands. Clear one of the two."
              : "A todo cannot be parked and filed at once yet: a project backlog gets its own list on the projects page."}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={remove}
          disabled={busy}
        >
          Delete
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={moveBucket}
            // Parking a filed todo is the same invisible state the checkbox
            // above guards; unfile it first. "Move to today" always works.
            disabled={busy || title.trim().length === 0 || (!parked && filed)}
          >
            {parked ? "Move to today" : "Move to backlog"}
          </Button>
          <Button type="submit" size="sm" disabled={busy || title.trim().length === 0}>
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}

export function EditTodoDialog({ todo, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit todo</DialogTitle>
        </DialogHeader>
        {/* Remount on open so a reopened dialog starts from stored values. */}
        {open && <EditForm key={todo.id} todo={todo} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
