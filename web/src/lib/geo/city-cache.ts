import { createAdminClient } from "@/lib/supabase/admin";

interface CityCache {
  names: Set<string>;
  countryMap: Map<string, string>;
}

let cache: CityCache | null = null;

export async function getCityCache(): Promise<CityCache> {
  if (cache) return cache;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("geo_cities")
    .select("name, country, population")
    .order("population", { ascending: false })
    .limit(100000);

  if (error) throw new Error(`Failed to load city cache: ${error.message}`);

  const names = new Set<string>();
  const countryMap = new Map<string, string>();

  for (const row of data ?? []) {
    if (!row.name || !row.country) continue;
    const key = row.name.toLowerCase();
    names.add(key);
    if (!countryMap.has(key)) {
      countryMap.set(key, row.country);
    }
  }

  cache = { names, countryMap };
  return cache;
}
