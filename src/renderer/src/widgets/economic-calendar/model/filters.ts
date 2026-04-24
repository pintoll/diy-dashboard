import type { CalendarEvent } from "@/src/entities/calendar-event";
import type {
  MinImportanceFilter,
  RangeKey,
  TypeFilter,
} from "./economic-calendar.types";
import { getRangeBounds, kstDateKey } from "./range";

export function applyFilters(
  events: CalendarEvent[],
  rangeKey: RangeKey,
  typeFilter: TypeFilter,
  minImportance: MinImportanceFilter,
  now: Date = new Date()
): CalendarEvent[] {
  const { from, to } = getRangeBounds(rangeKey, now);
  return events
    .filter((ev) => {
      const key = kstDateKey(ev.datetime);
      return key >= from && key <= to;
    })
    .filter((ev) => typeFilter === "all" || ev.kind === typeFilter)
    .filter((ev) => ev.importance >= minImportance)
    .sort((a, b) => a.datetime.localeCompare(b.datetime));
}

export function groupByDay(
  events: CalendarEvent[]
): Array<{ dateKey: string; items: CalendarEvent[] }> {
  const buckets = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const key = kstDateKey(ev.datetime);
    const list = buckets.get(key);
    if (list) {
      list.push(ev);
    } else {
      buckets.set(key, [ev]);
    }
  }
  return Array.from(buckets.entries())
    .map(([dateKey, items]) => ({ dateKey, items }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}
