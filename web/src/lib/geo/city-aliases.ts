import { createAdminClient } from "@/lib/supabase/admin";

const cache = new Map<string, string | null>();

/** Strip accents, trim, title-case — same normalization as normalizeCity(). */
function normalizeForLookup(city: string): string {
  return city
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/**
 * Normalizes a city name (accent-strip + title-case) and resolves it against
 * the city_aliases DB table for the given country.
 *
 * Resolution order:
 *   1. Normalize input (accent-strip, trim, title-case).
 *   2. Look up the normalized alias in city_aliases WHERE country = $country.
 *   3. Return the canonical value if found; otherwise return the normalized string.
 *
 * Results are cached in-memory for the lifetime of the process/session.
 * Returns null for null/empty/undefined input.
 */
export async function resolveCityAlias(
  city: string | null | undefined,
  country: string,
): Promise<string | null> {
  if (!city?.trim()) return null;

  const normalized = normalizeForLookup(city);
  const key = `${normalized.toLowerCase()}|${country}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data } = await db
      .from("city_aliases")
      .select("canonical")
      .ilike("alias", normalized)
      .eq("country", country)
      .limit(1);

    const canonical =
      Array.isArray(data) && data.length > 0
        ? ((data[0].canonical as string | null) ?? normalized)
        : normalized;

    cache.set(key, canonical);
    return canonical;
  } catch {
    cache.set(key, normalized);
    return normalized;
  }
}
