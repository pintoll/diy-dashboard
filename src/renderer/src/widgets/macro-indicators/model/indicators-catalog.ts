import type { IndicatorUnit } from "@/src/entities/market-indicator";

export type IndicatorMeta = {
  seriesId: string;
  label: string;
  description: string;
  unit: IndicatorUnit;
  fractionDigits: number;
};

export const MACRO_INDICATORS: readonly IndicatorMeta[] = [
  {
    seriesId: "DGS10",
    label: "10Y UST",
    description: "10-Year Treasury Yield",
    unit: "percent",
    fractionDigits: 2,
  },
  {
    seriesId: "DGS2",
    label: "2Y UST",
    description: "2-Year Treasury Yield",
    unit: "percent",
    fractionDigits: 2,
  },
  {
    seriesId: "DFF",
    label: "Fed Funds",
    description: "Federal Funds Effective Rate",
    unit: "percent",
    fractionDigits: 2,
  },
  {
    seriesId: "DTWEXBGS",
    label: "DXY",
    description: "Trade Weighted U.S. Dollar Index (Broad)",
    unit: "index",
    fractionDigits: 2,
  },
  {
    seriesId: "VIXCLS",
    label: "VIX",
    description: "CBOE Volatility Index",
    unit: "index",
    fractionDigits: 2,
  },
  {
    seriesId: "DEXKOUS",
    label: "USD/KRW",
    description: "South Korean Won per U.S. Dollar",
    unit: "currency",
    fractionDigits: 1,
  },
] as const;

export const ALL_SERIES_IDS: readonly string[] = MACRO_INDICATORS.map(
  (i) => i.seriesId
);
