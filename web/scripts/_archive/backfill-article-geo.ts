/**
 * backfill-article-geo.ts
 *
 * Re-populates geo fields on articles from affiliation text (parser) for all
 * already-linked articles. Replaces the OpenAlex-based geo written by the old
 * linkAuthorsToArticle logic.
 *
 * Usage:
 *   cd web && npx tsx src/scripts/backfill-article-geo.ts --dry-run
 *   cd web && npx tsx src/scripts/backfill-article-geo.ts --limit 10
 *   cd web && npx tsx src/scripts/backfill-article-geo.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ── Load .env.local ────────────────────────────────────────────────────────
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
import { parseAffiliation as geoParseAffiliation } from "@/lib/geo/affiliation-parser";
import { getRegion, getContinent } from "@/lib/geo/country-map";
import { lookupState } from "@/lib/geo/state-map";
import type { AuthorGeo } from "@/lib/import/forfatter-import/find-or-create";
import { logGeoUpdatedEvent, type GeoSnapshot } from "@/lib/article-events";

// ── Config ────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;
const FAIL_THRESHOLD = 0.1; // 10% of batch

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawAuthor {
  lastName?: string;
  foreName?: string;
  affiliations?: string[];
  affiliation?: string;
}

interface ArticleRow {
  id: string;
  authors: RawAuthor[] | null;
  specialty_tags: string[] | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAffiliation(author: RawAuthor): string | null {
  if (typeof author.affiliation === "string" && author.affiliation.trim()) {
    return author.affiliation;
  }
  if (Array.isArray(author.affiliations) && author.affiliations.length > 0) {
    return author.affiliations[0] ?? null;
  }
  return null;
}

function getAllUniqueAffiliations(authors: RawAuthor[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const author of authors) {
    const affs = Array.isArray(author.affiliations)
      ? author.affiliations
      : author.affiliation
        ? [author.affiliation]
        : [];
    for (const aff of affs) {
      const t = aff.trim();
      if (t && !seen.has(t)) { seen.add(t); result.push(t); }
    }
  }
  return result;
}

async function buildGeo(aff: string | null): Promise<AuthorGeo | null> {
  if (!aff) return null;
  const parsed = await geoParseAffiliation(aff);
  if (!parsed) return null;
  const state = parsed.city && parsed.country ? lookupState(parsed.city, parsed.country) : null;
  return { ...parsed, state };
}

function buildUpdate(first: AuthorGeo | null, last: AuthorGeo | null) {
  const firstRegion    = first?.country ? getRegion(first.country)    : null;
  const firstContinent = first?.country ? getContinent(first.country) : null;
  const firstState     = first?.state
    ?? (first?.city && first?.country ? lookupState(first.city, first.country) : null);

  return {
    geo_department:    first?.department  ?? null,
    geo_continent:     firstContinent,
    geo_region:        firstRegion,
    geo_country:       first?.country     ?? null,
    geo_state:         firstState,
    geo_city:          first?.city        ?? null,
    geo_institution:   first?.institution ?? null,
    location_parsed_at: new Date().toISOString(),
    location_confidence: first?.confidence ?? last?.confidence ?? null,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const admin = createAdminClient();

  console.log(`[backfill-article-geo] Starting${DRY_RUN ? " (DRY RUN)" : ""}${LIMIT ? ` (limit ${LIMIT})` : ""}`);

  let processed = 0;
  let updated   = 0;
  let skipped   = 0;
  let failed    = 0;
  let offset    = 0;

  while (true) {
    const fetchLimit = LIMIT ? Math.min(BATCH_SIZE, LIMIT - offset) : BATCH_SIZE;
    if (fetchLimit <= 0) break;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("articles")
      .select("id, authors, specialty_tags")
      .not("location_parsed_at", "is", null)
      .order("imported_at", { ascending: true })
      .range(offset, offset + fetchLimit - 1);

    if (error) {
      console.error(`[backfill-article-geo] Query error at offset ${offset}:`, error.message);
      break;
    }

    const batch = (data ?? []) as ArticleRow[];
    if (batch.length === 0) break;

    console.log(`[backfill-article-geo] Batch offset=${offset} size=${batch.length}`);

    let batchFailed = 0;

    for (const article of batch) {
      processed++;
      try {
        const authors = article.authors ?? [];
        if (authors.length === 0) {
          skipped++;
          continue;
        }

        const firstAuthor = authors[0];
        const lastAuthor  = authors.length > 1 ? authors[authors.length - 1] : null;

        const firstAff = getAffiliation(firstAuthor);
        const lastAff  = lastAuthor ? getAffiliation(lastAuthor) : null;

        if (!firstAff && !lastAff) {
          skipped++;
          continue;
        }

        let [firstGeo, lastGeo] = await Promise.all([
          buildGeo(firstAff),
          buildGeo(lastAff),
        ]);

        // Fallback: if first author gave no city/country, try all unique affiliations combined
        if (!firstGeo?.city && !firstGeo?.country) {
          const allAffs = getAllUniqueAffiliations(authors);
          if (allAffs.length > 1) {
            const fallbackGeo = await buildGeo(allAffs.join("\n"));
            if (fallbackGeo?.country) firstGeo = fallbackGeo;
          }
        }

        if (!firstGeo && !lastGeo) {
          skipped++;
          continue;
        }

        const update = {
          ...buildUpdate(firstGeo, lastGeo),
          // Guard against trigger failure on old articles where specialty_tags is NULL
          specialty_tags: article.specialty_tags ?? [],
        };

        if (DRY_RUN) {
          console.log(`[dry-run] ${article.id} → geo_country=${update.geo_country} geo_city=${update.geo_city}`);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: updateErr } = await (admin as any)
            .from("articles")
            .update(update)
            .eq("id", article.id);
          if (updateErr) throw new Error(updateErr.message);
          const geoNext: GeoSnapshot = {
            geo_country: update.geo_country,
            geo_city: update.geo_city,
            geo_state: update.geo_state,
            geo_region: update.geo_region,
            geo_continent: update.geo_continent,
            geo_institution: update.geo_institution,
            geo_department: update.geo_department,
          };
          logGeoUpdatedEvent(article.id, "backfill", null, geoNext);
        }

        updated++;
      } catch (err) {
        batchFailed++;
        failed++;
        console.error(`[backfill-article-geo] Failed article ${article.id}:`, err);
      }
    }

    // Hard stop if >10% of batch failed
    if (batchFailed / batch.length > FAIL_THRESHOLD) {
      console.error(`[backfill-article-geo] HARD STOP: ${batchFailed}/${batch.length} failed in batch (>${FAIL_THRESHOLD * 100}%). Aborting.`);
      break;
    }

    offset += batch.length;
    if (batch.length < fetchLimit) break; // last batch
  }

  console.log(`\n[backfill-article-geo] Done${DRY_RUN ? " (DRY RUN — no writes)" : ""}`);
  console.log(`  processed : ${processed}`);
  console.log(`  updated   : ${updated}`);
  console.log(`  skipped   : ${skipped}  (no affiliation text)`);
  console.log(`  failed    : ${failed}`);

  if (!DRY_RUN && updated > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: normRows, error: normErr } = await (admin as any).rpc("normalize_geo_city");
    if (normErr) console.error("[backfill-article-geo] normalize_geo_city failed:", normErr.message);
    else console.log(`  normalize_geo_city : ${normRows ?? 0} rows updated`);
  }
}

main().catch((err) => {
  console.error("[backfill-article-geo] Unhandled error:", err);
  process.exit(1);
});
