import type { CalendarEvent } from "@/src/entities/calendar-event";
import { EventRow } from "./EventRow";

const KST_TZ = "Asia/Seoul";

function formatDayHeader(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00+09:00`);
  const weekday = d.toLocaleDateString("en-US", {
    timeZone: KST_TZ,
    weekday: "short",
  });
  const md = d.toLocaleDateString("en-US", {
    timeZone: KST_TZ,
    month: "short",
    day: "2-digit",
  });
  return `${md} · ${weekday}`;
}

type Props = { dateKey: string; items: CalendarEvent[] };

export function DayGroup({ dateKey, items }: Props) {
  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 border-b border-border/30">
        {formatDayHeader(dateKey)}
      </div>
      <div className="flex flex-col divide-y divide-border/20">
        {items.map((ev) => (
          <EventRow key={ev.id} event={ev} />
        ))}
      </div>
    </div>
  );
}
