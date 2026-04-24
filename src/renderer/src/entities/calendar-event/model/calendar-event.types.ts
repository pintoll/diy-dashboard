export type Country = "US" | "KR" | "EU" | "JP" | "CN" | "UK" | "OTHER";

export type Importance = 1 | 2 | 3;

export type CalendarEventKind = "macro" | "earning" | "filing";

type BaseEvent = {
  id: string;
  datetime: string;
  country: Country;
  importance: Importance;
};

export type MacroEvent = BaseEvent & {
  kind: "macro";
  name: string;
  releaseId?: number;
  // Optional. Phase 1 (FRED releases) does not carry estimates/actuals —
  // those require a commercial calendar API. Future phases may populate them.
  expected?: number | null;
  previous?: number | null;
  actual?: number | null;
  unit?: string;
};

export type EarningEvent = BaseEvent & {
  kind: "earning";
  ticker: string;
  companyName: string;
  timing: "BMO" | "AMC" | "DMH";
  epsExpected: number | null;
  epsActual: number | null;
};

export type FilingEvent = BaseEvent & {
  kind: "filing";
  ticker: string;
  formType: string;
  title: string;
  url: string;
};

export type CalendarEvent = MacroEvent | EarningEvent | FilingEvent;
