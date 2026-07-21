import { useState, type FormEvent } from "react";
import {
  kstToday,
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
  const [date, setDate] = useState(todo.date ?? kstToday());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const commit = async (nextDate: string | null) => {
    setBusy(true);
    setError(null);
    try {
      await requireTodosApi().update(todo.id, {
        title: title.trim(),
        note: note.trim().length > 0 ? note.trim() : null,
        date: nextDate,
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
  const moveBucket = () => void commit(parked ? kstToday() : null);

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
              onCheckedChange={(checked) => setParked(checked === true)}
            />
            No date (backlog)
          </Label>
        </div>
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
            disabled={busy || title.trim().length === 0}
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
