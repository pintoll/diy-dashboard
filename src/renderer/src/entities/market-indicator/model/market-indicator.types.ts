export type SeriesPoint = {
  date: string;
  value: number;
};

export type SeriesSnapshot = {
  id: string;
  points: SeriesPoint[];
  fetchedAt: string;
};

export type IndicatorUnit = "percent" | "index" | "currency" | "basis_points";
