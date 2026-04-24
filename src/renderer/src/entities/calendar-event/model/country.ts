import type { Country } from "./calendar-event.types";

export const COUNTRY_LABEL: Record<Country, { flag: string; label: string }> = {
  US: { flag: "🇺🇸", label: "US" },
  KR: { flag: "🇰🇷", label: "KR" },
  EU: { flag: "🇪🇺", label: "EU" },
  JP: { flag: "🇯🇵", label: "JP" },
  CN: { flag: "🇨🇳", label: "CN" },
  UK: { flag: "🇬🇧", label: "UK" },
  OTHER: { flag: "🌐", label: "—" },
};

const FMP_COUNTRY_MAP: Record<string, Country> = {
  US: "US",
  "United States": "US",
  USA: "US",
  KR: "KR",
  "South Korea": "KR",
  Korea: "KR",
  EU: "EU",
  "Euro Area": "EU",
  "European Union": "EU",
  Germany: "EU",
  France: "EU",
  Italy: "EU",
  Spain: "EU",
  Netherlands: "EU",
  JP: "JP",
  Japan: "JP",
  CN: "CN",
  China: "CN",
  UK: "UK",
  "United Kingdom": "UK",
  GB: "UK",
};

export function normalizeCountry(raw: string | undefined | null): Country {
  if (!raw) return "OTHER";
  return FMP_COUNTRY_MAP[raw] ?? "OTHER";
}
