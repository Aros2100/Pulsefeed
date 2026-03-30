import { createAdminClient } from "@/lib/supabase/admin";
import { lookupCountry } from "@/lib/geo/country-map";

interface CityCache {
  names: Set<string>;
  countryMap: Map<string, string>;
}

let cache: CityCache | null = null;

/** Strip combining diacritics: "México" → "Mexico", "München" → "Munchen" */
function unaccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export async function getCityCache(): Promise<CityCache> {
  if (cache) return cache;

  const admin = createAdminClient();

  // PostgREST caps each request at 1000 rows regardless of .limit().
  // Paginate to load the full table.
  const PAGE = 1000;
  const allData: { name: string; country: string | null; population: number | null }[] = [];
  let offset = 0;
  while (true) {
    const { data: page, error } = await admin
      .from("geo_cities")
      .select("name, country, population")
      .order("population", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Failed to load city cache: ${error.message}`);
    if (!page?.length) break;
    for (const row of page) allData.push(row);
    if (page.length < PAGE) break;
    offset += PAGE;
  }

  const data = allData;

  const names = new Set<string>();
  const countryMap = new Map<string, string>();

  for (const row of data ?? []) {
    if (!row.name || !row.country || (row.population ?? 0) < 50000) continue;
    const key = row.name.trim().toLowerCase();
    const keyUnaccented = unaccent(key);
    // geo_cities.country stores full English country names (not ISO codes).
    // lookupCountry() expects ISO codes so will return null — fallback to row.country directly.
    const country = lookupCountry(row.country) ?? row.country;
    names.add(key);
    if (!countryMap.has(key)) countryMap.set(key, country);
    // Also store unaccented form so "México" → "mexico" hits "Mexico" in cache
    if (keyUnaccented !== key && !countryMap.has(keyUnaccented)) {
      countryMap.set(keyUnaccented, country);
    }
  }

  cache = { names, countryMap };
  return cache;
}

/**
 * Normalise a city name for cache lookup: lowercase + strip combining diacritics.
 * Use this at every call site instead of a bare `.toLowerCase()`.
 */
export function normalizeCityKey(city: string): string {
  return unaccent(city.toLowerCase());
}
