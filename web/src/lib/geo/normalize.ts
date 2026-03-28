/**
 * City alias map — mirrors the city_aliases DB table.
 * Keyed by the title-cased normalized form; value is the canonical name.
 */
const CITY_ALIASES: Record<string, string> = {
  "Kobenhavn":    "Copenhagen",
  "New York City": "New York",
  "St. Louis":    "St Louis",
  "Saint Louis":  "St Louis",
};

/**
 * Normalize a city name: strip accents, trim whitespace, title-case each word,
 * then apply alias resolution (e.g. "Kobenhavn" → "Copenhagen").
 * Returns null for null/undefined/empty input.
 */
export function normalizeCity(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return CITY_ALIASES[normalized] ?? normalized;
}
