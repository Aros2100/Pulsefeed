/**
 * backfill-geo-cities-from-nominatim.ts
 *
 * For articles that have geo_city IS NOT NULL AND geo_country IS NULL:
 *   1. Collect all distinct geo_city values
 *   2. Strip leading garbage chars ("" Naples" → "Naples")
 *   3. Filter out ISO codes, country names, institution names, etc.
 *   4. Skip cities already in geo_cities
 *   5. Look up remaining via Nominatim (OSM) → validate that the result
 *      actually mentions the queried city name in its display_name
 *   6. Insert found cities into geo_cities (synthetic geonameid ≥ 90_000_000)
 *
 * Rate limit: 1 req/s (Nominatim policy). Sleeps 1.1 s between requests.
 *
 * Usage:
 *   cd web && npx tsx src/scripts/backfill-geo-cities-from-nominatim.ts --dry-run
 *   cd web && npx tsx src/scripts/backfill-geo-cities-from-nominatim.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const t = line.trim();
  if (t.length === 0 || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  const k = t.slice(0, eq).trim();
  const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (k && !process.env[k]) process.env[k] = v;
}

import { createAdminClient } from "@/lib/supabase/admin";
import { lookupCountry } from "@/lib/geo/country-map";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

// ── Country name → canonical ───────────────────────────────────────────────────
function isoToCountry(code: string): string {
  return lookupCountry(code) ?? code;
}

// ── Reject obvious garbage BEFORE sending to Nominatim ───────────────────────
const GARBAGE_RES = [
  /@/,                           // email
  /https?:\/\/|www\./i,          // URL
  /\b(department|division|institute|hospital|clinic|center|centre|school|faculty|college|medical|university|spital|klinik|ministry|council|federation|neurology|perioperative|summit)\b/i,
  /\b(and|or|the)\b/i,           // stray English words
  /^\s*["'\-–—\.;,]+\s*$/,       // only punctuation
  /\d{4,}/,                      // 4+ consecutive digits
  /^[A-Z]{2,3}$/,                // ISO-2 or ISO-3 country codes (DE, DZA, SLV…)
  /^(VA|CA|NY|FL|TX|PA|OH|IL|MI)\s/i, // US state abbreviation prefix
  /[A-Z]\.[A-Z]/,                // abbreviations like R.O.C, C.A.M
  /["""'']\s*$/,                 // trailing quote char
  /^\s*["""'']/,                 // leading quote char (after cleanCity)
  /cedex/i,                      // French postal suffix
  /\bgun\b|\bprefecture\b|\bcanton\b|\bregion\b|\bdepartment\b/i,
];

// Known country names that should never be treated as city names
const COUNTRY_NAMES_SET = new Set([
  "greenland", "benin", "niger", "haiti", "fiji", "grenada", "guinea",
  "georgia", "jordan", "turkey", "france", "germany", "spain", "italy",
  "china", "japan", "india", "brazil", "colombia", "canada", "australia",
  "nigeria", "senegal", "burkina faso", "new caledonia", "viet nam",
  "cote d'ivoire", "islamic republic of", "república da turquia",
  "tunisie", "italie", "albanie", "griechenland", "sénégal", "francia",
  "french guiana", "trinidad and tobago",
]);

function isGarbage(city: string): boolean {
  const t = city.trim();
  if (t.length < 3 || t.length > 50) return true;
  const digits = (t.match(/\d/g) ?? []).length;
  if (digits > 2) return true;
  if (COUNTRY_NAMES_SET.has(t.toLowerCase())) return true;
  for (const re of GARBAGE_RES) if (re.test(t)) return true;
  return false;
}

/** Strip leading quote/punctuation chars that sometimes leak into city values */
function cleanCity(raw: string): string {
  return raw.replace(/^["'\u2018\u2019\u201c\u201d\s]+/, "").trim();
}

// ── Nominatim ─────────────────────────────────────────────────────────────────
interface NominatimResult {
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    country?: string;
    country_code?: string;
  };
}

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const UA = "PulseFeedGeoBackfill/1.0 (academic medical research)";

function unaccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

async function nominatimSearch(
  city: string
): Promise<{ countryCode: string; countryName: string } | null> {
  const url =
    `${NOMINATIM_BASE}/search` +
    `?city=${encodeURIComponent(city)}` +
    `&format=json&limit=3&addressdetails=1`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en" },
    });
  } catch (e) {
    console.error(`  [nominatim] fetch error for "${city}":`, e);
    return null;
  }
  if (!res.ok) {
    console.error(`  [nominatim] HTTP ${res.status} for "${city}"`);
    return null;
  }
  const data = (await res.json()) as NominatimResult[];
  if (!data.length) return null;

  // Normalise for comparison: lowercase + strip diacritics
  const cityNorm = unaccent(city.toLowerCase());

  for (const r of data) {
    const addr = r.address;
    if (!addr?.country_code) continue;

    // Validate: the returned display_name or address city/town must contain
    // the queried city name after unaccenting (prevents "DZA" → random French
    // hamlet; "Wroclaw" still matches "Wrocław" via unaccent)
    const displayNorm = unaccent(r.display_name.toLowerCase());
    const addrCityNorm = unaccent(
      (addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? "").toLowerCase()
    );

    const nameMatches =
      displayNorm.includes(cityNorm) ||
      addrCityNorm.includes(cityNorm) ||
      cityNorm.includes(addrCityNorm);  // handles "Iowa City" ↔ "Iowa City"

    if (!nameMatches) continue;

    const code = addr.country_code.toUpperCase();
    return { countryCode: code, countryName: isoToCountry(code) };
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SYNTHETIC_BASE = 90_000_000;

async function main() {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  // ── 1. Fetch distinct geo_city values ──────────────────────────────────────
  console.log("[nominatim-backfill] Fetching distinct geo_city values…");
  const { data: articleRows, error: artErr } = await db
    .from("articles")
    .select("geo_city")
    .not("geo_city", "is", null)
    .is("geo_country", null);
  if (artErr) { console.error("Query error:", artErr.message); return; }

  const rawCities = [...new Set(
    (articleRows ?? [])
      .map((r: { geo_city: string }) => r.geo_city as string)
      .filter(Boolean),
  )] as string[];
  console.log(`[nominatim-backfill] Distinct raw geo_city values: ${rawCities.length}`);

  // ── 2. Clean + deduplicate (leading quote variants collapse to same name) ──
  const cleanMap = new Map<string, string>(); // cleanedLower → first original
  for (const raw of rawCities) {
    const cleaned = cleanCity(raw);
    if (cleaned.length === 0) continue;
    const key = cleaned.toLowerCase();
    if (!cleanMap.has(key)) cleanMap.set(key, cleaned);
  }
  const cleaned = [...cleanMap.values()];
  console.log(`[nominatim-backfill] After cleaning: ${cleaned.length} unique values`);

  // ── 3. Garbage filter ──────────────────────────────────────────────────────
  const candidates = cleaned.filter((c) => !isGarbage(c));
  const discarded = cleaned.filter(isGarbage);
  console.log(`[nominatim-backfill] After garbage filter: ${candidates.length} candidates (discarded ${discarded.length})`);
  if (discarded.length > 0) {
    console.log("  Discarded:", discarded.map((c) => `"${c}"`).join(", "));
  }

  if (candidates.length === 0) {
    console.log("[nominatim-backfill] Nothing to look up.");
    return;
  }

  // ── 4. Skip cities already in geo_cities ──────────────────────────────────
  const { data: existingRows, error: exErr } = await db
    .from("geo_cities")
    .select("name")
    .in("name", candidates);
  if (exErr) { console.error("Existing check error:", exErr.message); return; }

  const existingLower = new Set(
    (existingRows ?? []).map((r: { name: string }) => r.name.toLowerCase()),
  );
  const toQuery = candidates.filter((c) => !existingLower.has(c.toLowerCase()));
  console.log(`[nominatim-backfill] Already in geo_cities: ${candidates.length - toQuery.length}`);
  console.log(`[nominatim-backfill] To query via Nominatim: ${toQuery.length}`);

  if (toQuery.length === 0) {
    console.log("[nominatim-backfill] Nothing new to look up.");
    return;
  }

  // ── 5. Nominatim lookups ───────────────────────────────────────────────────
  let found = 0;
  let notFound = 0;
  let inserted = 0;
  const results: { city: string; country: string; code: string }[] = [];

  const { data: maxRow } = await db
    .from("geo_cities")
    .select("geonameid")
    .gte("geonameid", SYNTHETIC_BASE)
    .order("geonameid", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextId = Math.max(SYNTHETIC_BASE, (maxRow?.geonameid ?? SYNTHETIC_BASE - 1) + 1);

  for (const city of toQuery) {
    process.stdout.write(`  "${city}"… `);
    const result = await nominatimSearch(city);

    if (!result) {
      console.log("NOT FOUND");
      notFound++;
    } else {
      console.log(`→ ${result.countryName} (${result.countryCode})`);
      found++;
      results.push({ city, country: result.countryName, code: result.countryCode });

      if (!DRY_RUN) {
        const row = {
          geonameid: nextId++,
          name: city,
          ascii_name: city,
          country_code: result.countryCode,
          country: result.countryName,
          admin1_code: null,
          state: null,
          population: 0,
          latitude: null,
          longitude: null,
        };
        const { error: insErr } = await db
          .from("geo_cities")
          .upsert(row, { onConflict: "geonameid" });
        if (insErr) {
          console.error(`  Insert error for "${city}":`, insErr.message);
        } else {
          inserted++;
        }
      }
    }

    await sleep(1100); // Nominatim rate limit: 1 req/s
  }

  console.log(`\n[nominatim-backfill] Done${DRY_RUN ? " (DRY RUN — no writes)" : ""}`);
  console.log(`  raw values  : ${rawCities.length}`);
  console.log(`  candidates  : ${candidates.length}  (after clean + garbage filter)`);
  console.log(`  already had : ${candidates.length - toQuery.length}`);
  console.log(`  looked up   : ${toQuery.length}`);
  console.log(`  found       : ${found}`);
  console.log(`  not found   : ${notFound}`);
  if (!DRY_RUN) console.log(`  inserted    : ${inserted}`);

  if (results.length > 0) {
    console.log("\nFound mappings:");
    for (const r of results) console.log(`  "${r.city}" → ${r.country}`);
  }

  console.log("\nNext step: run backfill-country-from-geo.ts");
}

main().catch((err) => {
  console.error("[nominatim-backfill] Unhandled error:", err);
  process.exit(1);
});
