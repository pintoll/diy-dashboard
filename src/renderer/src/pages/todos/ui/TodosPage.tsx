import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { kstToday, useTodoStore } from "@/src/entities/todo";
import { Card, CardContent } from "@/src/shared/ui/card";
import { DateNav } from "./DateNav";
import { OverdueSection } from "./OverdueSection";
import { TodoDayList } from "./TodoDayList";
import { WeekStrip } from "./WeekStrip";

export function TodosPage() {
  const ensureLoaded = useTodoStore((s) => s.ensureLoaded);
  const status = useTodoStore((s) => s.status);
  const error = useTodoStore((s) => s.error);
  const selectedDate = useTodoStore((s) => s.selectedDate);
  const isToday = selectedDate === kstToday();

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">
        <header className="flex items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
        </header>

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Todos</h1>
          <p className="text-sm text-muted-foreground">
            Plan by day, work one thing at a time.
          </p>
        </div>

        {status === "error" && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card>
          <CardContent className="flex flex-col gap-4">
            <DateNav />
            <WeekStrip />
            {isToday && <OverdueSection />}
            <TodoDayList />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
