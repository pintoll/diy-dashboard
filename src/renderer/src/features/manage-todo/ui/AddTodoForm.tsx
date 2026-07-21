import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { requireTodosApi, todoErrorMessage } from "@/src/entities/todo";
import { Button } from "@/src/shared/ui/button";
import { Input } from "@/src/shared/ui/input";

type Props = {
  // The day the new todo is planned for — the browsed date, not always today.
  // `null` writes straight into the backlog.
  date: string | null;
  placeholder?: string;
};

export function AddTodoForm({ date, placeholder = "Add a todo..." }: Props) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length === 0 || busy) return;

    setBusy(true);
    setError(null);
    try {
      await requireTodosApi().create({ title: trimmed, date });
      // The todos:changed push refreshes the list.
      setTitle("");
    } catch (err) {
      setError(todoErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={placeholder}
          className="h-8 text-sm"
          disabled={busy}
        />
        <Button
          type="submit"
          variant="outline"
          size="icon-sm"
          disabled={busy || title.trim().length === 0}
          aria-label="Add todo"
        >
          <Plus />
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
