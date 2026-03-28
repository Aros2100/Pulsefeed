/**
 * backfill-geo-from-institution.ts
 *
 * Two-pass script for articles with geo_institution IS NOT NULL AND geo_country IS NULL:
 *
 *   Pass 1 — Garbage cleanup:
 *     Set geo_institution = NULL for values that are clearly not real institutions
 *     (job titles, generic department names, etc.)
 *
 *   Pass 2 — Country resolution:
 *     For remaining articles, resolve geo_country via:
 *       a. institution-map.ts (static ~175-entry map, substring match)
 *       b. ROR search API (https://api.ror.org/organizations?query=...)
 *     Then derive geo_region + geo_continent.
 *
 * Usage:
 *   cd web && npx tsx src/scripts/backfill-geo-from-institution.ts --dry-run
 *   cd web && npx tsx src/scripts/backfill-geo-from-institution.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  const k = t.slice(0, eq).trim();
  const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (k && !process.env[k]) process.env[k] = v;
}

import { createAdminClient } from "@/lib/supabase/admin";
import { lookupInstitution } from "@/lib/geo/institution-map";
import { lookupCountry, getRegion, getContinent } from "@/lib/geo/country-map";
import { logGeoUpdatedEvent, type GeoSnapshot } from "@/lib/article-events";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

// ── Garbage patterns ───────────────────────────────────────────────────────────

/** Exact-match job titles / roles (case-insensitive) */
const GARBAGE_EXACT = new Set([
  "editor in chief",
  "editor-in-chief",
  "chief publications officer",
  "deputy editor",
  "associate editor",
  "section editor",
  "managing editor",
  "guest editor",
  "editorial board",
  "editorial office",
  "editorial committee",
  "correspondence",
  "letters to the editor",
]);

/**
 * Standalone generic academic terms — only garbage if the whole value matches,
 * i.e. there's no specific university/hospital prefix before it.
 * Applied after lowercasing.
 */
const GARBAGE_GENERIC_RES = [
  /^school of medicine$/i,
  /^college of medicine$/i,
  /^faculty of medicine$/i,
  /^school of public health$/i,
  /^college of pharmacy$/i,
  /^school of pharmacy$/i,
  /^department of medicine$/i,
  /^department of surgery$/i,
  /^department of pediatrics$/i,
  /^department of internal medicine$/i,
  /^department of neurology$/i,
  /^department of psychiatry$/i,
  /^department of radiology$/i,
  /^department of pathology$/i,
  /^department of pharmacology$/i,
  /^division of medicine$/i,
  /^institute of medicine$/i,
  /^graduate school$/i,
  /^medical school$/i,
  /^nursing school$/i,
];

/** Also reject values matching these general patterns */
const GARBAGE_RES = [
  /@/,                              // email address
  /https?:\/\//,                    // URL
  /^\d+$/,                          // only digits
  /^\s*[,;.]+\s*$/,                 // only punctuation
  /^department of \w/i,             // standalone "Department of X" without institution
  /^division of \w/i,               // standalone "Division of X"
  /^section of \w/i,                // standalone "Section of X"
  /^unit of \w/i,                   // standalone "Unit of X"
  /\band\s*$/i,                     // truncated value ending with "and"
  /\($/,                             // truncated value ending with open paren
  /^(chair|editor|reviewer|correspondent)$/i, // single role words
];

function isGarbageInstitution(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 3) return true;
  if (GARBAGE_EXACT.has(t.toLowerCase())) return true;
  for (const re of GARBAGE_GENERIC_RES) if (re.test(t)) return true;
  for (const re of GARBAGE_RES) if (re.test(t)) return true;
  return false;
}

// ── ROR search ─────────────────────────────────────────────────────────────────

const ROR_BASE = "https://api.ror.org/organizations";
const UA = "PulseFeedGeoBackfill/1.0 (mailto:digest@pulsefeed.dk)";

interface RorName {
  lang: string | null;
  types: string[];
  value: string;
}
interface RorGeonamesDetails {
  country_name?: string;
  country_code?: string;
}
interface RorSearchItem {
  names?: RorName[];
  locations?: Array<{ geonames_details?: RorGeonamesDetails }>;
  score?: number;
}
interface RorSearchResponse {
  number_of_results: number;
  items: RorSearchItem[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Tokenise into significant words: length > 2, not common stop words,
 * and not domain-generic institution words (which appear in almost every
 * institution name and provide no discriminatory power).
 */
function tokenize(s: string): Set<string> {
  const STOP = new Set([
    // Common grammar words
    "the", "of", "and", "for", "at", "in", "on", "to", "a", "an",
    // French / German / Spanish / Dutch articles & prepositions
    "de", "der", "die", "und", "les", "et", "du", "la", "le", "los", "las",
    "del", "van", "von", "am", "dem", "den", "des", "zur", "zum", "bei",
    // Domain-generic institution words (near-universal, zero discriminatory power)
    "university", "universite", "universitat", "universidad", "universidade",
    "universitaire", "universitaires", "universiti",
    "hospital", "hospitals", "hopital", "spital", "klinik", "klinikum",
    "medical", "medicine", "medizin", "medica", "medico",
    "school", "college", "institute", "faculty", "graduate",
    "center", "centre", "health", "care", "clinic", "clinique",
    "affiliated", "national", "general", "regional", "municipal",
    "research", "science", "sciences", "technology", "children",
    "department", "division", "section", "laboratory", "unit",
    // Common name prefixes that appear in institutions of all countries
    "red", "cross", "saint", "royal", "holy", "sacred",
  ]);
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

/**
 * Bidirectional token overlap: minimum of (query→result) and (result→query).
 * Both directions must reach the threshold to avoid partial-name false positives.
 */
function tokenOverlap(query: string, result: string): number {
  const qt = tokenize(query);
  const rt = tokenize(result);
  if (qt.size === 0 || rt.size === 0) return 0;
  let qInR = 0;
  for (const w of qt) if (rt.has(w)) qInR++;
  let rInQ = 0;
  for (const w of rt) if (qt.has(w)) rInQ++;
  return Math.min(qInR / qt.size, rInQ / rt.size);
}

/** In-memory cache: institution name (lowercased) → country or null. */
const rorCache = new Map<string, string | null>();

async function rorSearchCountry(institutionName: string): Promise<string | null> {
  const cacheKey = institutionName.toLowerCase();
  if (rorCache.has(cacheKey)) return rorCache.get(cacheKey)!;

  const url = `${ROR_BASE}?query=${encodeURIComponent(institutionName)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (e) {
    clearTimeout(timeout);
    console.warn(`  [ror] fetch error for "${institutionName}":`, e instanceof Error ? e.message : e);
    rorCache.set(cacheKey, null);
    return null;
  }
  if (!res.ok) {
    console.warn(`  [ror] HTTP ${res.status} for "${institutionName}"`);
    rorCache.set(cacheKey, null);
    return null;
  }

  const data = (await res.json()) as RorSearchResponse;
  if (!data.items?.length) {
    rorCache.set(cacheKey, null);
    return null;
  }

  const top = data.items[0];
  // v2 API: country is in locations[0].geonames_details.country_name
  const countryName = top.locations?.[0]?.geonames_details?.country_name ?? null;
  if (!countryName) {
    rorCache.set(cacheKey, null);
    return null;
  }

  // v2 API: display name is in names[] where types includes "ror_display"
  const displayName =
    top.names?.find((n) => n.types.includes("ror_display"))?.value ??
    top.names?.[0]?.value ??
    "";

  // Validate: at least 50% of the query's significant tokens must appear in the
  // top result's name. Prevents "University" → random foreign university.
  const overlap = tokenOverlap(institutionName, displayName);
  if (overlap < 0.65) {
    process.stdout.write(` (low overlap ${(overlap * 100).toFixed(0)}% — rejected)`);
    rorCache.set(cacheKey, null);
    return null;
  }

  // Canonicalize: run through lookupCountry in case ROR uses non-standard names
  const canonical = lookupCountry(countryName) ?? countryName;
  rorCache.set(cacheKey, canonical);
  return canonical;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  console.log(`[institution-backfill] Starting${DRY_RUN ? " (DRY RUN)" : ""}`);

  // ── Pass 1: Garbage cleanup ──────────────────────────────────────────────────
  console.log("\n[Pass 1] Loading articles with geo_institution IS NOT NULL AND geo_country IS NULL…");

  const PAGE = 1000;
  let allRows: { id: string; geo_institution: string; geo_city: string | null; geo_country: string | null; geo_state: string | null; geo_region: string | null; geo_continent: string | null; geo_department: string | null }[] = [];
  let off = 0;
  while (true) {
    const { data, error } = await admin
      .from("articles")
      .select("id, geo_institution, geo_city, geo_country, geo_state, geo_region, geo_continent, geo_department")
      .not("geo_institution", "is", null)
      .is("geo_country", null)
      .range(off, off + PAGE - 1);
    if (error) { console.error("Query error:", error.message); return; }
    if (!data?.length) break;
    for (const r of data) allRows.push(r);
    if (data.length < PAGE) break;
    off += PAGE;
  }
  console.log(`[Pass 1] ${allRows.length} articles with geo_institution IS NOT NULL AND geo_country IS NULL`);

  const garbageIds: string[] = [];
  const cleanRows: typeof allRows = [];
  for (const row of allRows) {
    if (isGarbageInstitution(row.geo_institution)) {
      garbageIds.push(row.id);
    } else {
      cleanRows.push(row);
    }
  }
  console.log(`[Pass 1] Garbage: ${garbageIds.length} → will set geo_institution = NULL`);
  console.log(`[Pass 1] Clean:   ${cleanRows.length} → will attempt country resolution`);

  if (!DRY_RUN && garbageIds.length > 0) {
    // Batch null-out in chunks of 500
    const CHUNK = 500;
    for (let i = 0; i < garbageIds.length; i += CHUNK) {
      const chunk = garbageIds.slice(i, i + CHUNK);
      const { error } = await admin
        .from("articles")
        .update({ geo_institution: null })
        .in("id", chunk);
      if (error) console.error(`  Garbage null-out error:`, error.message);
    }
    console.log(`[Pass 1] Nulled out ${garbageIds.length} garbage geo_institution values`);
  }

  // ── Pass 2: Country resolution ───────────────────────────────────────────────
  console.log("\n[Pass 2] Resolving geo_country from institution name…");

  // Deduplicate by institution name to minimise ROR calls
  const distinctInstitutions = new Map<string, string>(); // lower → original
  for (const row of cleanRows) {
    const key = row.geo_institution.toLowerCase();
    if (!distinctInstitutions.has(key)) distinctInstitutions.set(key, row.geo_institution);
  }
  console.log(`[Pass 2] ${distinctInstitutions.size} distinct institution names`);

  // Resolve country per distinct institution
  const institutionCountry = new Map<string, string | null>(); // lower → canonical country

  let rorQueried = 0;
  let rorFound = 0;
  let mapFound = 0;

  for (const [lower, original] of distinctInstitutions) {
    process.stdout.write(`  "${original}"… `);

    // a. Static institution-map (no I/O)
    const fromMap = lookupInstitution(original);
    if (fromMap?.country) {
      institutionCountry.set(lower, fromMap.country);
      mapFound++;
      console.log(`→ ${fromMap.country} (map)`);
      continue;
    }

    // b. ROR search API
    process.stdout.write("(ROR) ");
    rorQueried++;
    const country = await rorSearchCountry(original);
    if (country) {
      institutionCountry.set(lower, country);
      rorFound++;
      console.log(`→ ${country}`);
    } else {
      institutionCountry.set(lower, null);
      console.log("NOT FOUND");
    }

    await sleep(1100); // ROR rate limit: ≤1 req/s
  }

  console.log(`\n[Pass 2] map: ${mapFound}  ROR: ${rorFound}/${rorQueried}  not found: ${distinctInstitutions.size - mapFound - rorFound}`);

  // ── Pass 2: Write updates ────────────────────────────────────────────────────
  let updated = 0;
  let skipped = 0;

  for (const row of cleanRows) {
    const country = institutionCountry.get(row.geo_institution.toLowerCase()) ?? null;
    if (!country) {
      skipped++;
      continue;
    }

    const region    = getRegion(country);
    const continent = getContinent(country);

    if (DRY_RUN) {
      console.log(`[dry-run] ${row.id} → country=${country} region=${region} continent=${continent} (institution="${row.geo_institution}")`);
    } else {
      const { error } = await admin
        .from("articles")
        .update({
          geo_country:   country,
          geo_region:    region,
          geo_continent: continent,
        })
        .eq("id", row.id);
      if (error) {
        console.error(`  Update error for ${row.id}:`, error.message);
        continue;
      }
      const prev: GeoSnapshot = {
        geo_city:        row.geo_city,
        geo_country:     row.geo_country,
        geo_state:       row.geo_state,
        geo_region:      row.geo_region,
        geo_continent:   row.geo_continent,
        geo_institution: row.geo_institution,
        geo_department:  row.geo_department,
      };
      logGeoUpdatedEvent(row.id, "backfill", prev, {
        ...prev,
        geo_country:   country,
        geo_region:    region,
        geo_continent: continent,
      });
    }
    updated++;
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`\n[institution-backfill] Done${DRY_RUN ? " (DRY RUN — no writes)" : ""}`);
  console.log(`  total articles        : ${allRows.length}`);
  console.log(`  garbage nulled        : ${garbageIds.length}`);
  console.log(`  candidates (clean)    : ${cleanRows.length}`);
  console.log(`  distinct institutions : ${distinctInstitutions.size}`);
  console.log(`    resolved via map    : ${mapFound}`);
  console.log(`    resolved via ROR    : ${rorFound}`);
  console.log(`    not resolved        : ${distinctInstitutions.size - mapFound - rorFound}`);
  console.log(`  articles updated      : ${updated}`);
  console.log(`  articles skipped      : ${skipped}  (institution not in any lookup)`);
}

main().catch((err) => {
  console.error("[institution-backfill] Unhandled error:", err);
  process.exit(1);
});
