/**
 * Normalize a city name: strip accents, trim whitespace, title-case each word.
 * Returns null for null/undefined/empty input.
 *
 * Alias resolution (e.g. "Kobenhavn" → "Copenhagen") is handled by
 * resolveCityAlias() in lib/geo/city-aliases.ts which queries the DB.
 */
export function normalizeCity(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/**
 * Normalize a country name to a canonical form.
 * Resolves known variants produced by OpenAlex and the ROR API
 * to the standard name used throughout PulseFeed.
 *
 * Add new entries here whenever a new variant is discovered.
 */
const COUNTRY_ALIASES: Record<string, string> = {
  "the netherlands": "Netherlands",
  "türkiye":         "Turkey",
  "turkiye":         "Turkey",
};

export function normalizeCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  return COUNTRY_ALIASES[key] ?? trimmed;
}
