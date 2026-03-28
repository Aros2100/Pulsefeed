/**
 * backfill-country-from-geo.ts
 *
 * Resolves geo_country for articles that already have geo_city or geo_state
 * but are missing geo_country. Three scenarios, tried in order:
 *
 *   1. geo_city  → country via city-map (static ~170 cities)
 *   2. geo_city  → country via city-cache (DB GeoNames, ~100k cities)
 *   3. geo_state → country via lookupCountry (handles US state names + others)
 *
 * After resolving country, geo_region and geo_continent are derived and written.
 *
 * Usage:
 *   cd web && npx tsx src/scripts/backfill-country-from-geo.ts --dry-run
 *   cd web && npx tsx src/scripts/backfill-country-from-geo.ts
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
import { lookupCity } from "@/lib/geo/city-map";
import { getCityCache, normalizeCityKey } from "@/lib/geo/city-cache";
import { lookupCountry, getRegion, getContinent } from "@/lib/geo/country-map";

const BATCH_SIZE = 500;
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;

interface ArticleRow {
  id: string;
  geo_city: string | null;
  geo_state: string | null;
  specialty_tags: string[] | null;
}

async function main() {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  console.log(`[backfill-country-from-geo] Loading city cache…`);
  const cityCache = await getCityCache();
  console.log(`[backfill-country-from-geo] City cache loaded (${cityCache.countryMap.size} cities)`);
  console.log(`[backfill-country-from-geo] Starting${DRY_RUN ? " (DRY RUN)" : ""}${LIMIT ? ` limit=${LIMIT}` : ""}`);

  let offset = 0;
  let examined = 0;
  let byCity = 0;
  let byState = 0;
  let skipped = 0;
  let updated = 0;
  let failed = 0;

  while (true) {
    const fetchLimit = LIMIT ? Math.min(BATCH_SIZE, LIMIT - offset) : BATCH_SIZE;
    if (fetchLimit <= 0) break;

    const { data, error } = await db
      .from("articles")
      .select("id, geo_city, geo_state, specialty_tags")
      .is("geo_country", null)
      .not("specialty_tags", "is", null)
      .or("geo_city.not.is.null,geo_state.not.is.null")
      .order("imported_at", { ascending: false })
      .range(offset, offset + fetchLimit - 1);

    if (error) {
      console.error(`[backfill-country-from-geo] Query error:`, error.message);
      break;
    }

    const batch = (data ?? []) as ArticleRow[];
    if (batch.length === 0) break;

    console.log(`[backfill-country-from-geo] Batch offset=${offset} size=${batch.length}`);

    for (const article of batch) {
      examined++;
      try {
        let country: string | null = null;
        let source: "city-map" | "city-cache" | "state" | null = null;

        // ── Scenario 1 & 2: city → country ──────────────────────────────────
        if (article.geo_city) {
          // 1a: static city-map (~170 well-known cities)
          const fromMap = lookupCity(article.geo_city);
          if (fromMap?.country) {
            country = fromMap.country;
            source = "city-map";
          }

          // 1b: GeoNames DB cache (~100k cities)
          if (!country) {
            const fromCache = cityCache.countryMap.get(normalizeCityKey(article.geo_city));
            if (fromCache) {
              country = fromCache;
              source = "city-cache";
            }
          }
        }

        // ── Scenario 3: state → country ──────────────────────────────────────
        if (!country && article.geo_state) {
          const fromState = lookupCountry(article.geo_state);
          if (fromState) {
            country = fromState;
            source = "state";
          }
        }

        if (!country) {
          skipped++;
          continue;
        }

        const geoRegion    = getRegion(country);
        const geoContinent = getContinent(country);

        const update = {
          geo_country:    country,
          geo_region:     geoRegion,
          geo_continent:  geoContinent,
          specialty_tags: article.specialty_tags ?? [],
        };

        if (DRY_RUN) {
          console.log(`[dry-run] ${article.id} → country=${country} (via ${source}) city=${article.geo_city ?? "-"} state=${article.geo_state ?? "-"}`);
        } else {
          const { error: updateErr } = await db
            .from("articles")
            .update(update)
            .eq("id", article.id);
          if (updateErr) throw new Error(updateErr.message);
        }

        if (source === "city-map" || source === "city-cache") byCity++;
        else byState++;
        updated++;
      } catch (err) {
        failed++;
        console.error(`[backfill-country-from-geo] Failed ${article.id}:`, err);
      }
    }

    offset += batch.length;
    if (batch.length < fetchLimit) break;
  }

  console.log(`\n[backfill-country-from-geo] Done${DRY_RUN ? " (DRY RUN — no writes)" : ""}`);
  console.log(`  examined : ${examined}`);
  console.log(`  updated  : ${updated}  (via city: ${byCity}, via state: ${byState})`);
  console.log(`  skipped  : ${skipped}  (city/state not in lookup tables)`);
  console.log(`  failed   : ${failed}`);
}

main().catch((err) => {
  console.error("[backfill-country-from-geo] Unhandled error:", err);
  process.exit(1);
});
