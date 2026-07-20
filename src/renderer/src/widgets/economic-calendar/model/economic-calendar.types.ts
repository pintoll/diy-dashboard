import type {
  CalendarEvent,
  CalendarEventKind,
  Importance,
} from "@/src/entities/calendar-event";

export type EconomicCalendarConfig = Record<string, never>;

export type FetchStatus = "idle" | "loading" | "success" | "error";

export type RangeKey = "thisWeek" | "nextWeek" | "twoWeeks";

export type TypeFilter = "all" | CalendarEventKind;

export type MinImportanceFilter = Importance;

export type EconomicCalendarState = {
  events: CalendarEvent[];
  lastFetchedAt: string | null;
  status: FetchStatus;
  errorMessage: string | null;
  rangeKey: RangeKey;
  typeFilter: TypeFilter;
  minImportance: MinImportanceFilter;
};

export type EconomicCalendarActions = {
  fetchRange: () => Promise<void>;
  setRange: (rangeKey: RangeKey) => void;
  setTypeFilter: (typeFilter: TypeFilter) => void;
  setMinImportance: (minImportance: MinImportanceFilter) => void;
};
