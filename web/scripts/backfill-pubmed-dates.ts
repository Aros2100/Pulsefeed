/**
 * backfill-pubmed-dates.ts
 *
 * Re-fetches pubmed_date and pubmed_indexed_at for all articles via PubMed EFetch
 * using the fixed parsePubMedHistoryDate (numeric months). Updates only rows where
 * the values differ.
 *
 * Run:
 *   cd web && npx tsx scripts/backfill-pubmed-dates.ts
 */

import { config } from "dotenv";
config({ path: new URL("../.env.local", import.meta.url).pathname });
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchArticleDetails } from "@/lib/import/article-import/fetcher";

const PAGE_SIZE   = 1000;
const BATCH_SIZE  = 20;
const RATE_LIMIT  = 110;
const LOG_EVERY   = 500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const admin = createAdminClient();

  let page = 0;
  let totalProcessed = 0;
  let totalUpdated   = 0;
  let totalUnchanged = 0;

  console.log("Starting pubmed_date / pubmed_indexed_at backfill…");

  while (true) {
    const from = page * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    const { data: rows, error } = await admin
      .from("articles")
      .select("id, pubmed_id, pubmed_date, pubmed_indexed_at")
      .not("pubmed_id", "is", null)
      .range(from, to);

    if (error) {
      console.error(`Page ${page}: DB fetch failed — ${error.message}`);
      break;
    }
    if (!rows || rows.length === 0) break;

    // Process in EFetch batches
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batchRows = rows.slice(i, i + BATCH_SIZE);
      const pmids     = batchRows.map((r) => r.pubmed_id as string);

      let fetched: Awaited<ReturnType<typeof fetchArticleDetails>> = [];
      try {
        fetched = await fetchArticleDetails(pmids);
      } catch (err) {
        console.error(`EFetch error for PMIDs [${pmids.join(",")}]: ${err instanceof Error ? err.message : String(err)}`);
        totalProcessed += batchRows.length;
        if (i + BATCH_SIZE < rows.length) await sleep(RATE_LIMIT);
        continue;
      }

      // Build a lookup by pubmedId
      const fetchedMap = new Map(fetched.map((a) => [a.pubmedId, a]));

      for (const row of batchRows) {
        const fetched = fetchedMap.get(row.pubmed_id as string);
        if (!fetched) {
          totalUnchanged++;
          totalProcessed++;
          continue;
        }

        const newPubmedDate      = fetched.pubmedDate      ?? null;
        const newPubmedIndexedAt = fetched.pubmedIndexedAt ?? null;

        const changed =
          newPubmedDate      !== (row.pubmed_date      ?? null) ||
          newPubmedIndexedAt !== (row.pubmed_indexed_at ?? null);

        if (changed) {
          const { error: updateErr } = await admin
            .from("articles")
            .update({ pubmed_date: newPubmedDate, pubmed_indexed_at: newPubmedIndexedAt })
            .eq("id", row.id);

          if (updateErr) {
            console.error(`Update failed for article ${row.id}: ${updateErr.message}`);
          } else {
            totalUpdated++;
            if (totalUpdated <= 3 || totalProcessed % LOG_EVERY < BATCH_SIZE) {
              console.log(
                `  Updated ${row.pubmed_id}: pubmed_date ${row.pubmed_date ?? "null"} → ${newPubmedDate ?? "null"}, ` +
                `pubmed_indexed_at ${row.pubmed_indexed_at ?? "null"} → ${newPubmedIndexedAt ?? "null"}`
              );
            }
          }
        } else {
          totalUnchanged++;
        }

        totalProcessed++;
      }

      if (totalProcessed % LOG_EVERY < BATCH_SIZE) {
        console.log(`Progress: ${totalProcessed} processed, ${totalUpdated} updated, ${totalUnchanged} unchanged`);
      }

      if (i + BATCH_SIZE < rows.length) await sleep(RATE_LIMIT);
    }

    if (rows.length < PAGE_SIZE) break;
    page++;
  }

  console.log("\n=== Backfill complete ===");
  console.log(`Total processed : ${totalProcessed}`);
  console.log(`Total updated   : ${totalUpdated}`);
  console.log(`Total unchanged : ${totalUnchanged}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
