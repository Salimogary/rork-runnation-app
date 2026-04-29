import { WORLD_COUNTRIES } from "@/constants/countries";

const DEFAULT_COUNTRY_NAME_BY_CODE = new Map(
  WORLD_COUNTRIES.map((country) => [country.iso_alpha2.toUpperCase(), country.name])
);

function normalizeCountryLookupKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[()]/g, " ")
    .replace(/[-/]/g, " ")
    .replace(/[.,']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const DEFAULT_COUNTRY_CODE_BY_NAME = new Map<string, string>();

for (const country of WORLD_COUNTRIES) {
  const code = country.iso_alpha2.toUpperCase();
  const name = country.name.trim();
  DEFAULT_COUNTRY_CODE_BY_NAME.set(name.toLowerCase(), code);
  DEFAULT_COUNTRY_CODE_BY_NAME.set(normalizeCountryLookupKey(name), code);
}

const COUNTRY_NAME_ALIASES: Record<string, string> = {
  "russian federation": "RU",
  "russia": "RU",
  "democratic republic of the congo": "CD",
  "dr congo": "CD",
  "drc": "CD",
  "drc congo": "CD",
  "congo drc": "CD",
  "congo kinshasa": "CD",
  "congo democratic republic": "CD",
  "congo congo brazzaville": "CG",
  "congo brazzaville": "CG",
  "the congo": "CG",
  "republic of the congo": "CG",
  "cape verde": "CV",
  "cabo verde": "CV",
  "czech republic": "CZ",
  "czechia": "CZ",
  "swaziland": "SZ",
  "eswatini": "SZ",
  "united states": "US",
  "united states of america": "US",
  "usa": "US",
  "uk": "GB",
  "united kingdom": "GB",
  "great britain": "GB",
  "uae": "AE",
  "united arab emirates": "AE",
  "ivory coast": "CI",
  "cote divoire": "CI",
  "cote d ivoire": "CI",
  "palestine": "PS",
  "state of palestine": "PS",
  "micronesia": "FM",
  "federated states of micronesia": "FM",
  "laos": "LA",
  "lao peoples democratic republic": "LA",
  "myanmar": "MM",
  "burma": "MM",
  "south korea": "KR",
  "republic of korea": "KR",
  "north korea": "KP",
  "democratic peoples republic of korea": "KP",
  "north macedonia": "MK",
  "macedonia": "MK",
  "moldova": "MD",
  "republic of moldova": "MD",
  "tanzania": "TZ",
  "united republic of tanzania": "TZ",
  "bolivia": "BO",
  "bolivia plurinational state of": "BO",
  "venezuela": "VE",
  "venezuela bolivarian republic of": "VE",
};

const COUNTRY_NAME_OVERRIDES_BY_CODE = new Map<string, string>();

export function setCountryNameOverrides(
  countries: Array<{ iso_alpha2: string; name: string }> | null | undefined
) {
  COUNTRY_NAME_OVERRIDES_BY_CODE.clear();

  for (const country of countries ?? []) {
    const code = country?.iso_alpha2?.trim().toUpperCase();
    const name = country?.name?.trim();

    if (!code || !name) continue;
    COUNTRY_NAME_OVERRIDES_BY_CODE.set(code, name);
  }
}

export function getCountryNameByCode(code: string): string | null {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  return (
    COUNTRY_NAME_OVERRIDES_BY_CODE.get(normalized) ??
    DEFAULT_COUNTRY_NAME_BY_CODE.get(normalized) ??
    null
  );
}

export function formatCountryName(country: string | null | undefined): string | null {
  if (!country) return null;

  const trimmed = country.trim();
  if (!trimmed) return null;

  if (trimmed.length === 2) {
    return getCountryNameByCode(trimmed) ?? trimmed.toUpperCase();
  }

  const normalizedKey = normalizeCountryLookupKey(trimmed);
  const matchedCode =
    COUNTRY_NAME_ALIASES[normalizedKey] ??
    DEFAULT_COUNTRY_CODE_BY_NAME.get(trimmed.toLowerCase()) ??
    DEFAULT_COUNTRY_CODE_BY_NAME.get(normalizedKey);
  if (matchedCode) {
    return getCountryNameByCode(matchedCode) ?? trimmed;
  }

  return trimmed;
}

export function formatCountryList(countries: Array<string | null | undefined>): string[] {
  return countries
    .map((country) => formatCountryName(country))
    .filter((country): country is string => Boolean(country));
}
