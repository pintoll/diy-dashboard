import { useState, type FormEvent } from "react";
import {
  requireTodosApi,
  todoErrorMessage,
  type Todo,
} from "@/src/entities/todo";
import { Button } from "@/src/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { Label } from "@/src/shared/ui/label";

type Props = {
  todo: Todo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function EditForm({ todo, onDone }: { todo: Todo; onDone: () => void }) {
  const [title, setTitle] = useState(todo.title);
  const [note, setNote] = useState(todo.note ?? "");
  const [date, setDate] = useState(todo.date);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requireTodosApi().update(todo.id, {
        title: title.trim(),
        note: note.trim().length > 0 ? note.trim() : null,
        date,
      });
      onDone();
    } catch (err) {
      setError(todoErrorMessage(err));
      setBusy(false);
    }
  };

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
        <Input
          id="todo-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="todo-date">Date</Label>
        <Input
          id="todo-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
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
        <Button type="submit" size="sm" disabled={busy || title.trim().length === 0}>
          Save
        </Button>
      </div>
    </form>
  );
}

export function EditTodoDialog({ todo, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit todo</DialogTitle>
        </DialogHeader>
        {/* Remount on open so a reopened dialog starts from stored values. */}
        {open && <EditForm key={todo.id} todo={todo} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
