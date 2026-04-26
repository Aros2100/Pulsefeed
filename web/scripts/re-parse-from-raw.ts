/**
 * re-parse-from-raw.ts
 *
 * Iterates over all rows in article_pubmed_raw (fetch_source = 'backfill'),
 * re-parses raw_xml through parseArticleFragment (which now handles inline tags
 * and HTML entity decoding), and updates the articles table with the full
 * field set.
 *
 * Run:
 *   npx tsx scripts/re-parse-from-raw.ts --dry-run --limit 10
 *   npx tsx scripts/re-parse-from-raw.ts --limit 100
 *   npx tsx scripts/re-parse-from-raw.ts
 */

import { config } from "dotenv";
config({ path: new URL("../.env.local", import.meta.url).pathname });

import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseArticleFragment,
  articleDetailsToDbUpdate,
} from "@/lib/import/article-import/fetcher";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;

const PAGE = 50; // small page to avoid upstream timeout on large raw_xml payloads

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  re-parse-from-raw.ts");
  console.log(`  mode: ${dryRun ? "DRY RUN" : "LIVE"}${isFinite(limit) ? `, limit: ${limit}` : ""}`);
  console.log("══════════════════════════════════════════════════════════════\n");

  let updated = 0;
  let skipped = 0;
  let failed  = 0;
  let totalProcessed = 0;
  let page = 0;

  for (;;) {
    const from = page * PAGE;
    const to   = from + PAGE - 1;

    const { data, error } = await admin
      .from("article_pubmed_raw")
      .select("id, article_id, pubmed_id, raw_xml")
      .eq("fetch_source", "backfill")
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    if (page === 0) {
      console.log(`First page fetched (${data.length} rows). Processing...\n`);
    }

    for (const row of data as { id: string; article_id: string; pubmed_id: string; raw_xml: string }[]) {
      if (isFinite(limit) && totalProcessed >= limit) break;
      totalProcessed++;

      const parsed = parseArticleFragment(row.raw_xml);
      if (!parsed) {
        console.warn(`[${totalProcessed}] SKIP ${row.pubmed_id} — parse returned null`);
        skipped++;
        continue;
      }

      const dbUpdate = articleDetailsToDbUpdate(parsed);

      if (dryRun) {
        if (totalProcessed <= 5) {
          console.log(`[${totalProcessed}] DRY ${row.pubmed_id}`);
          console.log(`      title: ${String(dbUpdate.title ?? "").slice(0, 100)}`);
          console.log(`      abstract: ${String(dbUpdate.abstract ?? "").slice(0, 100)}`);
        }
        updated++;
        continue;
      }

      const { error: updateErr } = await admin
        .from("articles")
        .update(dbUpdate)
        .eq("id", row.article_id);

      if (updateErr) {
        console.warn(`[${totalProcessed}] FAIL ${row.pubmed_id} — ${updateErr.message}`);
        failed++;
        continue;
      }

      updated++;
      if (updated % 500 === 0) {
        console.log(`Progress: ${updated} updated, ${skipped} skipped, ${failed} failed (page ${page + 1})`);
      }
    }

    if (isFinite(limit) && totalProcessed >= limit) break;
    if (data.length < PAGE) break;
    page++;
  }

  console.log("\n──────────────────────────────────────────────────────────────");
  if (dryRun) {
    console.log(`  DRY RUN complete. Would update: ${updated}, skip: ${skipped}`);
  } else {
    console.log(`  Done. Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`);
  }
  console.log("──────────────────────────────────────────────────────────────\n");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
