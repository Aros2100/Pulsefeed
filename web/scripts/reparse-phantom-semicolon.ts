/**
 * Re-parse the 138 Klasse A articles with phantom semicolons in institution fields.
 * Uses the fixed geo pipeline — the fix prevents semicolons from being inserted
 * inside institution names like "Iran University of Medical Sciences".
 *
 * Usage: npx tsx scripts/reparse-phantom-semicolon.ts [--dry-run]
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createAdminClient } from "../src/lib/supabase/admin";
import { determineArticleGeo } from "../src/lib/import/author-import/find-or-create";
import { enrichArticleAddresses } from "../src/lib/geo/v2/address-enrichment";
import pLimit from "p-limit";

const DRY_RUN = process.argv.includes("--dry-run");
const CONCURRENCY = 5;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = createAdminClient() as any;

async function main() {
  // 1. Find all affected article_ids
  const { data: affected, error } = await admin
    .from("article_geo_addresses")
    .select("article_id")
    .or("institution.like.%; %,institution2.like.%; %,institution3.like.%; %");

  if (error) throw new Error(`query failed: ${error.message}`);

  const articleIds = [...new Set(((affected ?? []) as { article_id: string }[]).map(r => r.article_id))];
  console.log(`Found ${articleIds.length} articles with phantom semicolons${DRY_RUN ? " (DRY RUN)" : ""}`);

  let updated = 0;
  let skipped = 0;
  let errors  = 0;

  const limiter = pLimit(CONCURRENCY);
  let done = 0;

  await Promise.all(articleIds.map((articleId) => limiter(async () => {
    try {
      // Load article + first author
      const { data: art, error: artErr } = await admin
        .from("articles")
        .select("id, pubmed_id, authors, geo_class")
        .eq("id", articleId)
        .single();

      if (artErr || !art || art.geo_class !== "A") { skipped++; done++; return; }

      const rawAuthors = (art.authors ?? []) as Record<string, unknown>[];
      if (rawAuthors.length === 0) { skipped++; done++; return; }

      const firstRaw = rawAuthors[0];
      const firstAuthor = {
        lastName:    String(firstRaw.lastName ?? ""),
        foreName:    String(firstRaw.foreName ?? ""),
        affiliations: Array.isArray(firstRaw.affiliations)
          ? firstRaw.affiliations as string[]
          : firstRaw.affiliation != null ? [String(firstRaw.affiliation)] : [],
        orcid: firstRaw.orcid != null ? String(firstRaw.orcid) : null,
      };

      if (!firstAuthor.affiliations[0]) { skipped++; done++; return; }

      // Re-run geo pipeline with fixed parser
      const geoResult = await determineArticleGeo(admin, firstAuthor, null);

      if (geoResult.geo_class !== "A" || !geoResult.geo_country) { skipped++; done++; return; }

      if (!DRY_RUN) {
        await admin.from("article_geo_addresses").delete().eq("article_id", articleId);
        await admin.from("article_geo_addresses").insert({
          article_id:            articleId,
          position:              1,
          city:                  geoResult.geo_city,
          state:                 geoResult.geo_state,
          country:               geoResult.geo_country,
          region:                geoResult.geo_region,
          continent:             geoResult.geo_continent,
          institution:           geoResult.geo_institution,
          institution2:          geoResult.geo_institution2,
          institution3:          geoResult.geo_institution3,
          institutions_overflow: geoResult.geo_institutions_overflow ?? [],
          department:            geoResult.geo_department,
          department2:           geoResult.geo_department2,
          department3:           geoResult.geo_department3,
          departments_overflow:  geoResult.geo_departments_overflow ?? [],
          confidence:            geoResult.parser_confidence,
          state_source:          geoResult.geo_state ? "parser" : null,
        });
        await enrichArticleAddresses(articleId);
      }

      updated++;
    } catch (e) {
      console.error(`  error on ${articleId}:`, (e as Error).message);
      errors++;
    }

    done++;
    if (done % 20 === 0 || done === articleIds.length) {
      process.stdout.write(`\r  Progress: ${done}/${articleIds.length} (updated:${updated} skip:${skipped} err:${errors})`);
    }
  })));

  console.log("\n──────────────────────────────────────────────");
  console.log(`  Updated : ${updated}`);
  console.log(`  Skipped : ${skipped}`);
  console.log(`  Errors  : ${errors}`);
  if (DRY_RUN) console.log("  (DRY RUN — no DB writes)");
  console.log("──────────────────────────────────────────────\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
