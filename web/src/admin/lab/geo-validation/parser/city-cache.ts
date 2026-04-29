import { createAdminClient } from "@/lib/supabase/admin";
import { lookupCountry } from "./country-map";

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

  const BATCH_SIZE = 1000;
  const allRows: Array<{ name: string; country: string }> = [];
  let offset = 0;

  while (true) {
    if (offset > 200_000) {
      throw new Error(`city-cache pagination runaway: offset=${offset}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .rpc("get_city_country_map")
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw new Error(`Failed to load city cache: ${error.message}`);

    const batch = (data ?? []) as Array<{ name: string; country: string }>;
    allRows.push(...batch);

    if (batch.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  const names = new Set<string>();
  const countryMap = new Map<string, string>();

  for (const row of allRows) {
    const key = (row.name as string).trim().toLowerCase();
    const keyUnaccented = unaccent(key);
    const country = lookupCountry(row.country) ?? row.country;
    names.add(key);
    if (!countryMap.has(key)) countryMap.set(key, country);
    if (keyUnaccented !== key) {
      names.add(keyUnaccented);
      if (!countryMap.has(keyUnaccented)) countryMap.set(keyUnaccented, country);
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
