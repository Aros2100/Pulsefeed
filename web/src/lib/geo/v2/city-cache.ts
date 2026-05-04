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
  // Normalize apostrophe/quote variants → straight apostrophe before unaccent.
  // Covers: curly quotes U+2018/2019, modifier letter apostrophe U+02BC/02BB,
  // backtick U+0060, acute accent U+00B4.
  const apostropheNorm = city.replace(/[‘’ʼʻ`´]/g, "'");
  return unaccent(apostropheNorm.toLowerCase());
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

  // Egyptian cities — alternative spellings in affiliations
  "minia":         "minya",        // DB: "Minya" (El-Minia / Minya)
  "el minia":      "minya",
  "el-minia":      "minya",

  // Argentine cities — affiliations often use short form
  "tucuman":       "san miguel de tucuman", // DB: "San Miguel de Tucumán"

  // Chinese city with apostrophe variant (covered by apostrophe normalization
  // in normalizeCityKey, but alias kept as belt-and-suspenders)
  "yanan":         "yan'an",       // no-apostrophe variant

  // Belgian cities — English exonyms (ascii_name = local name, no help here)
  "antwerp":       "antwerpen",
  "ghent":         "gent",
  "bruges":        "brugge",
  "louvain":       "leuven",       // French name for Leuven

  // Moroccan cities — spelling variants
  "fez":           "fes",          // DB ascii_name: "Fes" (from "Fès")
  "marrakesh":     "marrakech",
  "marrakech":     "marrakech",    // ensure direct form also works
  "meknes":        "meknes",       // "Meknès" → ascii "Meknes"

  // Moroccan cities — additional variants
  "casablanca":    "casablanca",   // usually works; explicit for robustness
  "tangier":       "tanger",       // DB: "Tanger" (ascii_name: "Tanger")
  "tangiers":      "tanger",
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
      .select("name, ascii_name, country, state")
      .gte("population", 5000)
      .not("name", "is", null)
      .not("country", "is", null)
      .order("population", { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw new Error(`Failed to load city cache: ${error.message}`);

    const batch = (data ?? []) as Array<{ name: string; ascii_name: string | null; country: string; state: string | null }>;
    if (batch.length === 0) break;

    for (const row of batch) {
      // Build three keys per city:
      //   rawKey  — original lowercase (preserves special chars like curly apostrophes)
      //   key     — normalizeCityKey(name): apostrophe-normalized + NFD-unaccented
      //   asciiKey — normalizeCityKey(ascii_name): GeoNames' pre-computed ASCII
      //              transliteration, handles non-decomposable chars like ł→l, ą→a.
      //              This is the main fix for Polish, Czech, etc. cities.
      const rawKey  = row.name.trim().toLowerCase();
      const key     = normalizeCityKey(row.name.trim());
      const asciiKey = row.ascii_name ? normalizeCityKey(row.ascii_name.trim()) : null;
      const country = lookupCountry(row.country) ?? row.country;
      const state   = row.state?.trim() || null;

      // Collect distinct keys to index (dedup inline)
      const keysToIndex = [...new Set([rawKey, key, ...(asciiKey ? [asciiKey] : [])])];

      // ── names + countryMap ──────────────────────────────────────────────────
      for (const k of keysToIndex) {
        names.add(k);
        if (!countryMap.has(k)) countryMap.set(k, country);
      }

      // ── stateMap + countryStateMap (population-ordered: first entry wins) ──
      if (state) {
        for (const k of keysToIndex) {
          if (!stateMap.has(k)) stateMap.set(k, state);
          const ck = `${k}::${country}`;
          if (!countryStateMap.has(ck)) countryStateMap.set(ck, state);
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
