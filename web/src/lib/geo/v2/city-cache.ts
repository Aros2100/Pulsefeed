/**
 * Lab city cache — loads name / country / state from geo_cities directly
 * (population ≥ 5 000, paginated in batches of 1 000).
 *
 * No new RPC required.  Direct SELECT on geo_cities via the admin client.
 *
 * Exported:
 *   getCityCache()         — returns the populated CityCache
 *   normalizeCityKey(city) — lowercase + strip combining diacritics
 *   lookupStateByCity(city, country?) — state for a city, with alias support
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { lookupCountry } from "./country-map";

// ── Cache interface ───────────────────────────────────────────────────────────

interface CityCache {
  names: Set<string>;
  countryMap: Map<string, string>;      // normCity → canonical country
  stateMap: Map<string, string>;        // normCity → state (highest-population winner)
  countryStateMap: Map<string, string>; // "normCity::country" → state
}

let cache: CityCache | null = null;

// ── Normalisation helpers ─────────────────────────────────────────────────────

/** Strip combining diacritics: "Göteborg" → "Goteborg", "Århus" → "Arhus" */
function unaccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeCityKey(city: string): string {
  return unaccent(city.toLowerCase());
}

// ── City aliases ──────────────────────────────────────────────────────────────
// Maps a normalised English exonym (no diacritics) to the normalised DB key.
// Only needed when the DB stores a LOCAL spelling that differs from English.
// (Cities already stored in English — Copenhagen, Rome, Munich — need no alias.)

const CITY_ALIASES: Record<string, string> = {
  // European exonyms → local DB spelling (unaccented)
  "aarhus":        "arhus",       // DB: "Århus"    → "Arhus"
  "gothenburg":    "goteborg",    // DB: "Göteborg" → "Goteborg"
  "cologne":       "koln",        // DB: "Köln"     → "Koln"
  "munich":        "munchen",     // DB: "München"  → "Munchen"
  "florence":      "firenze",
  "venice":        "venezia",
  "naples":        "napoli",
  "milan":         "milano",
  "lisbon":        "lisboa",
  "warsaw":        "warszawa",
  "prague":        "praha",
  "vienna":        "wien",
  "the hague":     "den haag",    // DB: "Den Haag"
  "geneva":        "geneve",      // DB: "Genève"   → "Geneve"
  // Saint / St variants — GeoNames primary may be "St. Louis" or "Saint Louis"
  "saint louis":   "st. louis",   // cover both spellings
  "st louis":      "st. louis",   // no-dot variant
  "saint paul":    "st. paul",
  "st paul":       "st. paul",
  "saint john":    "st. john's",  // DB: "St. John's"
};

// ── Cache loader ──────────────────────────────────────────────────────────────

export async function getCityCache(): Promise<CityCache> {
  if (cache) return cache;

  const admin = createAdminClient();
  const BATCH_SIZE = 1000;

  const names = new Set<string>();
  const countryMap = new Map<string, string>();
  const stateMap = new Map<string, string>();
  const countryStateMap = new Map<string, string>();

  let offset = 0;

  while (true) {
    if (offset > 200_000) {
      throw new Error(`city-cache pagination runaway: offset=${offset}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("geo_cities")
      .select("name, country, state")
      .gte("population", 5000)
      .not("name", "is", null)
      .not("country", "is", null)
      .order("population", { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw new Error(`Failed to load city cache: ${error.message}`);

    const batch = (data ?? []) as Array<{ name: string; country: string; state: string | null }>;
    if (batch.length === 0) break;

    for (const row of batch) {
      const rawKey = row.name.trim().toLowerCase();
      const key = unaccent(rawKey);
      const unaccentedRaw = unaccent(rawKey);   // same as key; kept for clarity
      const country = lookupCountry(row.country) ?? row.country;
      const state = row.state?.trim() || null;

      // ── names + countryMap ──────────────────────────────────────────────────
      // Add both the accented key and the unaccented key for city lookup.
      for (const k of [rawKey, key]) {
        names.add(k);
        if (!countryMap.has(k)) countryMap.set(k, country);
      }

      // ── stateMap (population-ordered: first entry wins) ───────────────────
      if (state) {
        if (!stateMap.has(key)) stateMap.set(key, state);
        if (rawKey !== key && !stateMap.has(rawKey)) stateMap.set(rawKey, state);

        // Country-specific state map — key: "normCity::country"
        const countryKey = `${key}::${country}`;
        if (!countryStateMap.has(countryKey)) countryStateMap.set(countryKey, state);
        if (rawKey !== key) {
          const rawCountryKey = `${rawKey}::${country}`;
          if (!countryStateMap.has(rawCountryKey)) countryStateMap.set(rawCountryKey, state);
        }
      }
    }

    if (batch.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  // Propagate aliases into the cache maps so that alias keys work everywhere:
  // not just in lookupStateByCity() but also in cityNames.has() checks inside
  // the parser's city-scan step (Step 3).
  // Only fires when the DB key exists and the alias key is not already present.
  for (const [aliasKey, dbKey] of Object.entries(CITY_ALIASES)) {
    if (!names.has(aliasKey) && names.has(dbKey)) {
      names.add(aliasKey);
      const country = countryMap.get(dbKey);
      if (country && !countryMap.has(aliasKey)) countryMap.set(aliasKey, country);
      const state = stateMap.get(dbKey);
      if (state && !stateMap.has(aliasKey)) stateMap.set(aliasKey, state);
      if (country && state) {
        const ck = `${aliasKey}::${country}`;
        if (!countryStateMap.has(ck)) countryStateMap.set(ck, state);
      }
    }
  }

  cache = { names, countryMap, stateMap, countryStateMap };
  return cache;
}

// ── Public lookup ─────────────────────────────────────────────────────────────

/**
 * Look up the state/region for a city name.
 *
 * Strict mode (country provided):
 *   1. Exact normalised key in countryStateMap  ("geneva::Switzerland")
 *   2. Alias key in countryStateMap             ("geneve::Switzerland")
 *   → Returns null if neither matches.  Never falls back to the
 *     population-winner stateMap, which may belong to a different country.
 *
 * Relaxed mode (no country):
 *   3. Exact normalised key in stateMap (population winner, any country)
 *   4. Alias key in stateMap
 */
export async function lookupStateByCity(
  city: string,
  country?: string
): Promise<string | null> {
  const { stateMap, countryStateMap } = await getCityCache();
  const key = normalizeCityKey(city);
  const aliasKey = CITY_ALIASES[key];

  if (country) {
    // 1. Direct country-specific match
    const direct = countryStateMap.get(`${key}::${country}`);
    if (direct) return direct;

    // 2. Alias → country-specific match
    //    e.g. "geneva" → "geneve" → countryStateMap["geneve::Switzerland"]
    if (aliasKey) {
      const aliased = countryStateMap.get(`${aliasKey}::${country}`);
      if (aliased) return aliased;
    }

    // Strict: no match for the requested country → return null.
    // Never use stateMap here; its winner may belong to a different country.
    return null;
  }

  // Relaxed mode (no country filter)
  // 3. Direct match (population winner, any country)
  const direct = stateMap.get(key);
  if (direct) return direct;

  // 4. Alias lookup (any country)
  if (aliasKey) {
    const aliased = stateMap.get(aliasKey);
    if (aliased) return aliased;
  }

  return null;
}
