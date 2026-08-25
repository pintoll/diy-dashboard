import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { today } from "@shared/day";
import {
  requireTodosApi,
  todoErrorMessage,
  useTodoStore,
} from "@/src/entities/todo";
import { Button } from "@/src/shared/ui/button";
import { Input } from "@/src/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/ui/select";
import {
  formatTimeRange,
  parseTimeRange,
  suggestRange,
} from "../lib/plan-time-input";

type Props = {
  nowHm: string;
};

// Adds a line by picking one of today's open todos
// (assistant-architecture.md). An empty time field takes the suggested block;
// the same todo may be penciled into several blocks, so no dedup.
export function AddPlanLine({ nowHm }: Props) {
  const todos = useTodoStore((s) => s.todos);
  const openTodos = todos.filter((t) => !t.done);

  const [todoId, setTodoId] = useState("");
  const [range, setRange] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const suggested = suggestRange(nowHm);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (todoId === "" || busy) return;
    const parsed = range.trim() === "" ? suggested : parseTimeRange(range);
    if (parsed === null) {
      setError('Time must be "HH:MM-HH:MM" within the 05:00 day');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await requireTodosApi().plan.create({
        todoId,
        // Read at submit time, never from cached state: a sheet sitting open
        // across the 05:00 rollover must not write into the expired day.
        day: today(),
        start: parsed.start,
        end: parsed.end,
      });
      // The todos:changed push renders the new line.
      setTodoId("");
      setRange("");
    } catch (err) {
      setError(todoErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Select value={todoId} onValueChange={setTodoId} disabled={busy}>
          <SelectTrigger
            size="sm"
            className="min-w-0 flex-1"
            aria-label="Pick a todo to plan"
          >
            <SelectValue
              placeholder={openTodos.length === 0 ? "No todos today" : "Todo..."}
            />
          </SelectTrigger>
          <SelectContent>
            {openTodos.map((todo) => (
              <SelectItem key={todo.id} value={todo.id}>
                {todo.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={range}
          onChange={(e) => {
            setRange(e.target.value);
            setError(null);
          }}
          placeholder={formatTimeRange(suggested.start, suggested.end)}
          className="h-8 w-28 shrink-0 text-xs tabular-nums"
          aria-label="Time range"
          disabled={busy}
        />
        <Button
          type="submit"
          variant="outline"
          size="icon-sm"
          disabled={busy || todoId === ""}
          aria-label="Add plan line"
        >
          <Plus />
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
