/**
 * One-off backfill: decode raw XML character entities in article titles and abstracts.
 *
 * Run with:
 *   cd web && npx tsx src/scripts/fix-xml-entities.ts
 */

import { createAdminClient } from "@/lib/supabase/admin";

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

async function main() {
  const admin = createAdminClient();

  console.log("Querying articles with XML entities in title or abstract...");

  // Fetch in pages to avoid memory issues on large tables
  const PAGE_SIZE = 500;
  let offset = 0;
  let totalUpdated = 0;

  while (true) {
    const { data, error } = await admin
      .from("articles")
      .select("id, title, abstract")
      .or("title.match.&#x?[0-9a-fA-F]+;,abstract.match.&#x?[0-9a-fA-F]+;")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("Query error:", error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;

    const toUpdate = data
      .map((row) => ({
        id: row.id,
        title:    row.title    ? decodeXmlEntities(row.title)    : row.title,
        abstract: row.abstract ? decodeXmlEntities(row.abstract) : row.abstract,
      }))
      .filter((row, i) =>
        row.title !== data[i].title || row.abstract !== data[i].abstract
      );

    if (toUpdate.length > 0) {
      for (const row of toUpdate) {
        const { error: updateErr } = await admin
          .from("articles")
          .update({ title: row.title, abstract: row.abstract })
          .eq("id", row.id);

        if (updateErr) {
          console.error(`Failed to update article ${row.id}:`, updateErr.message);
        } else {
          totalUpdated++;
        }
      }
      console.log(`Batch offset ${offset}: updated ${toUpdate.length} of ${data.length}`);
    } else {
      console.log(`Batch offset ${offset}: ${data.length} rows fetched, 0 needed update`);
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`\nDone. Total articles updated: ${totalUpdated}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
