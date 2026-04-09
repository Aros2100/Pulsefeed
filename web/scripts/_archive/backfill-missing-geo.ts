/**
 * backfill-missing-geo.ts
 *
 * Targeted re-parse for approved articles that have no geo_country and have
 * authors with multiple unique affiliation strings. Uses the combined-affiliations
 * fallback strategy: joins all unique affs with \n and parses once.
 *
 * Usage:
 *   cd web && npx tsx src/scripts/backfill-missing-geo.ts --dry-run
 *   cd web && npx tsx src/scripts/backfill-missing-geo.ts --limit 50
 *   cd web && npx tsx src/scripts/backfill-missing-geo.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (key && !process.env[key]) process.env[key] = val;
}

import { createAdminClient } from "@/lib/supabase/admin";
import { parseAffiliation } from "@/lib/geo/affiliation-parser";
import { getRegion, getContinent } from "@/lib/geo/country-map";
import { lookupState } from "@/lib/geo/state-map";
import { logGeoUpdatedEvent, type GeoSnapshot } from "@/lib/article-events";

const BATCH_SIZE = 200;
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;

interface RawAuthor {
  lastName?: string;
  foreName?: string;
  affiliations?: string[];
  affiliation?: string;
}

function getAllUniqueAffiliations(authors: RawAuthor[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const author of authors) {
    const affs = (typeof author.affiliation === "string" && author.affiliation.trim())
      ? [author.affiliation]
      : (Array.isArray(author.affiliations) && author.affiliations.length > 0)
        ? author.affiliations
        : [];
    for (const aff of affs) {
      const t = aff.trim();
      if (t && !seen.has(t)) { seen.add(t); result.push(t); }
    }
  }
  return result;
}

async function main() {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  console.log(`[backfill-missing-geo] Starting${DRY_RUN ? " (DRY RUN)" : ""}${LIMIT ? ` limit=${LIMIT}` : ""}`);

  let offset = 0;
  let examined = 0;
  let skipped = 0;
  let updated = 0;
  let failed = 0;

  while (true) {
    const fetchLimit = LIMIT ? Math.min(BATCH_SIZE, LIMIT - offset) : BATCH_SIZE;
    if (fetchLimit <= 0) break;

    const { data, error } = await db
      .from("articles")
      .select("id, authors, specialty_tags")
      .is("geo_country", null)
      .not("authors", "is", null)
      .not("specialty_tags", "is", null)
      .order("imported_at", { ascending: false })
      .range(offset, offset + fetchLimit - 1);

    if (error) {
      console.error(`[backfill-missing-geo] Query error:`, error.message);
      break;
    }

    const batch = (data ?? []) as { id: string; authors: unknown; specialty_tags: string[] | null }[];
    if (batch.length === 0) break;

    console.log(`[backfill-missing-geo] Batch offset=${offset} size=${batch.length}`);

    for (const article of batch) {
      examined++;
      try {
        if (!Array.isArray(article.authors) || article.authors.length === 0) {
          skipped++;
          continue;
        }

        const authors = article.authors as RawAuthor[];
        const allAffs = getAllUniqueAffiliations(authors);

        if (allAffs.length < 1) {
          skipped++;
          continue;
        }

        // Strategy: try first affiliation alone first (most reliable for single-institution papers).
        // If that yields no country, fall back to all affiliations combined (helps when the first
        // affiliation is institution-only and a later one includes city/country).
        let parsed = await parseAffiliation(allAffs[0]);
        if (!parsed?.country && allAffs.length > 1) {
          parsed = await parseAffiliation(allAffs.join("\n"));
        }

        if (!parsed?.country) {
          skipped++;
          continue;
        }

        const geoCountry    = parsed.country ?? null;
        const geoCity       = parsed.city ?? null;
        const geoRegion     = geoCountry ? getRegion(geoCountry) : null;
        const geoContinent  = geoCountry ? getContinent(geoCountry) : null;
        const geoState      = geoCity && geoCountry ? lookupState(geoCity, geoCountry) : null;

        const update = {
          geo_country:         geoCountry,
          geo_city:            geoCity,
          geo_region:          geoRegion,
          geo_continent:       geoContinent,
          geo_state:           geoState,
          geo_institution:     parsed.institution ?? null,
          geo_department:      parsed.department ?? null,
          location_confidence: parsed.confidence,
          location_parsed_at:  new Date().toISOString(),
          specialty_tags:      article.specialty_tags ?? [],
        };

        if (DRY_RUN) {
          console.log(`[dry-run] ${article.id} → country=${geoCountry} city=${geoCity} (${allAffs.length} affs)`);
        } else {
          const { error: updateErr } = await db.from("articles").update(update).eq("id", article.id);
          if (updateErr) throw new Error(updateErr.message);
          const geoNext: GeoSnapshot = {
            geo_country: geoCountry,
            geo_city: geoCity,
            geo_state: geoState,
            geo_region: geoRegion,
            geo_continent: geoContinent,
            geo_institution: parsed.institution ?? null,
            geo_department: parsed.department ?? null,
          };
          logGeoUpdatedEvent(article.id, "backfill", null, geoNext);
        }

        updated++;
      } catch (err) {
        failed++;
        console.error(`[backfill-missing-geo] Failed ${article.id}:`, err);
      }
    }

    offset += batch.length;
    if (batch.length < fetchLimit) break;
  }

  console.log(`\n[backfill-missing-geo] Done${DRY_RUN ? " (DRY RUN — no writes)" : ""}`);
  console.log(`  examined : ${examined}`);
  console.log(`  updated  : ${updated}`);
  console.log(`  skipped  : ${skipped}  (single/no affs, or parser gave nothing)`);
  console.log(`  failed   : ${failed}`);

  if (!DRY_RUN && updated > 0) {
    const { data: normRows, error: normErr } = await db.rpc("normalize_geo_city");
    if (normErr) console.error("[backfill-missing-geo] normalize_geo_city failed:", normErr.message);
    else console.log(`  normalize_geo_city : ${normRows ?? 0} rows updated`);
  }
}

main().catch((err) => {
  console.error("[backfill-missing-geo] Unhandled error:", err);
  process.exit(1);
});
