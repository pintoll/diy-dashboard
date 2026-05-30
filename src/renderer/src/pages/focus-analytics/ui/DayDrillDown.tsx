import { useState } from "react";
import {
  POMODORO_PRESETS,
  sessionsOnDate,
  type FocusMode,
  type PomodoroPresetId,
  type PomodoroSessionRecord,
} from "@/src/entities/pomodoro-session";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/shared/ui/dialog";
import { cn } from "@/src/shared/lib/utils";

type DayDrillDownProps = {
  date: string | null;
  sessions: PomodoroSessionRecord[];
  onClose: () => void;
  onSaveNote: (id: string, note: string) => void;
};

function presetLabel(id: PomodoroPresetId): string {
  return POMODORO_PRESETS.find((p) => p.id === id)?.label ?? id;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayHeading(date: string): string {
  // `date` is a local `YYYY-MM-DD` key; parse as local, not UTC.
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function topApps(buckets: Record<string, number>, n = 3): [string, number][] {
  return Object.entries(buckets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

const MODE_LABEL: Record<FocusMode, string> = {
  focus: "Focus",
  leisure: "Leisure",
};

export function DayDrillDown({
  date,
  sessions,
  onClose,
  onSaveNote,
}: DayDrillDownProps) {
  const daySessions = date ? sessionsOnDate(sessions, date) : [];
  const focusCount = daySessions.filter((s) => s.attention === "focus").length;
  const leisureCount = daySessions.length - focusCount;

  return (
    <Dialog open={date !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{date ? formatDayHeading(date) : ""}</DialogTitle>
          <DialogDescription>
            {daySessions.length}{" "}
            {daySessions.length === 1 ? "session" : "sessions"} · {focusCount}{" "}
            focus · {leisureCount} leisure
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {daySessions.map((s) => (
            <SessionRow key={s.id} session={s} onSaveNote={onSaveNote} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "focus" | "leisure" | "collapse";
}) {
  const toneClass =
    tone === "collapse"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : tone === "focus"
        ? "border-primary/40 bg-primary/10 text-primary"
        : "border-border bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        toneClass
      )}
    >
      {children}
    </span>
  );
}

function SessionRow({
  session,
  onSaveNote,
}: {
  session: PomodoroSessionRecord;
  onSaveNote: (id: string, note: string) => void;
}) {
  const [note, setNote] = useState(session.note ?? "");
  const isCollapse =
    session.intendedMode === "focus" && session.attention === "leisure";
  const apps = topApps(session.processBuckets);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium tabular-nums">
          {formatTime(session.startedAt)} – {formatTime(session.endedAt)}
        </div>
        <div className="text-xs text-muted-foreground">
          {presetLabel(session.presetId)}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {session.intendedMode && (
          <Badge tone={session.intendedMode === "focus" ? "focus" : "leisure"}>
            Intent: {MODE_LABEL[session.intendedMode]}
          </Badge>
        )}
        <Badge
          tone={
            isCollapse ? "collapse" : session.attention === "focus" ? "focus" : "leisure"
          }
        >
          {isCollapse ? "Collapse" : MODE_LABEL[session.attention]}
        </Badge>
      </div>

      {apps.length > 0 && (
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {apps.map(([exe, sec]) => (
            <div key={exe} className="flex justify-between gap-2 tabular-nums">
              <span className="truncate">{exe}</span>
              <span>{Math.round(sec / 60)}m</span>
            </div>
          ))}
        </div>
      )}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => {
          if (note !== (session.note ?? "")) onSaveNote(session.id, note);
        }}
        placeholder="Why this session? (optional note)"
        rows={2}
        className="placeholder:text-muted-foreground border-input dark:bg-input/30 w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
      />
    </div>
  );
}
