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
