import { cn } from "@/src/shared/lib/utils";
import {
  COUNTRY_LABEL,
  type CalendarEvent,
} from "@/src/entities/calendar-event";

function formatStars(importance: 1 | 2 | 3): string {
  return "★".repeat(importance) + "☆".repeat(3 - importance);
}

type Props = { event: CalendarEvent };

export function EventRow({ event }: Props) {
  const country = COUNTRY_LABEL[event.country];

  switch (event.kind) {
    case "macro":
      return (
        <div className="grid grid-cols-[18px_1fr_auto] items-center gap-2 px-2 py-1 text-[11px] hover:bg-muted/30">
          <span title={country.label}>{country.flag}</span>
          <span className="truncate text-foreground/90">{event.name}</span>
          <span
            className={cn(
              "tracking-tighter text-[10px]",
              event.importance === 3
                ? "text-amber-400/90"
                : event.importance === 2
                  ? "text-muted-foreground"
                  : "text-muted-foreground/40"
            )}
          >
            {formatStars(event.importance)}
          </span>
        </div>
      );

    case "earning":
    case "filing":
      return null;
  }
}
