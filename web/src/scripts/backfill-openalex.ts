/**
 * Backfill existing articles + authors with OpenAlex metadata.
 * Does NOT change author links — only adds openalex_work_id, fwci, ror_id, etc.
 *
 * Run with:
 *   cd web && npx tsx src/scripts/backfill-openalex.ts          # live
 *   cd web && npx tsx src/scripts/backfill-openalex.ts --dry-run # preview only
 */

import { readFileSync } from "fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq);
  const val = trimmed.slice(eq + 1);
  if (!process.env[key]) process.env[key] = val;
}

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchWorksByDois, type OpenAlexWork } from "@/lib/openalex/client";
import { matchPubMedToOpenAlex } from "@/lib/openalex/match-authors";
import { decodeHtmlEntities } from "@/lib/pubmed/importer";

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 200;
const DRY_RUN = process.argv.includes("--dry-run");

interface AuthorRow {
  id: string;
  display_name: string;
  openalex_id: string | null;
  orcid: string | null;
  ror_id: string | null;
}

async function main() {
  const admin = createAdminClient();

  if (DRY_RUN) console.log("\n*** DRY RUN — no writes ***\n");

  let totalArticlesEnriched = 0;
  let totalAuthorsOpenalexId = 0;
  let totalAuthorsRorId = 0;
  let totalAuthorsOrcid = 0;
  let batchNum = 0;
  let offset = 0;

  while (true) {
    batchNum++;

    // 1. Fetch articles missing openalex_work_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: articles, error } = await (admin as any)
      .from("articles")
      .select("id, doi, authors")
      .not("doi", "is", null)
      .is("openalex_work_id", null)
      .order("imported_at", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error("Query error:", error.message);
      break;
    }

    if (!articles || articles.length === 0) break;

    const dois = articles
      .filter((a: { doi: string | null }) => Boolean(a.doi))
      .map((a: { doi: string }) => a.doi);

    // 2. Batch OpenAlex lookup
    let oaWorksMap = new Map<string, OpenAlexWork>();
    if (dois.length > 0) {
      try {
        oaWorksMap = await fetchWorksByDois(dois);
      } catch (e) {
        console.warn(`  Batch ${batchNum}: OpenAlex fetch failed:`, e);
        offset += BATCH_SIZE;
        continue;
      }
    }

    let batchArticles = 0;
    let batchAuthorsOaId = 0;
    let batchAuthorsRor = 0;
    let batchAuthorsOrcid = 0;

    // 3. Process each article
    for (const article of articles) {
      if (!article.doi) continue;
      const work = oaWorksMap.get(article.doi.toLowerCase());
      if (!work) continue;

      // 3a. Update article
      if (!DRY_RUN) {
        await admin.from("articles").update({
          openalex_work_id: work.id,
          fwci: work.fwci,
        }).eq("id", article.id);
      }
      batchArticles++;

      // 3b. Match and enrich authors
      const rawAuthors = (article.authors ?? []) as Array<Record<string, unknown>>;
      if (rawAuthors.length === 0) continue;

      // Get linked authors for this article
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: linkedRows } = await (admin as any)
        .from("article_authors")
        .select("position, author_id, authors:author_id(id, display_name, openalex_id, orcid, ror_id)")
        .eq("article_id", article.id)
        .order("position", { ascending: true });

      if (!linkedRows || linkedRows.length === 0) continue;

      // Build PubMed author list for matching
      const pubmedAuthors = rawAuthors.map(a => ({
        lastName: decodeHtmlEntities(String(a.lastName ?? "")),
        firstName: decodeHtmlEntities(String(a.foreName ?? "")),
      }));

      const matchMap = matchPubMedToOpenAlex(pubmedAuthors, work.authorships);

      // For each match, enrich the linked author
      for (const [pmIdx, oaAuthorship] of matchMap) {
        // Find the article_authors row at this position (1-indexed)
        const aaRow = linkedRows.find((r: { position: number }) => r.position === pmIdx + 1);
        if (!aaRow) continue;

        const author: AuthorRow | null = aaRow.authors;
        if (!author) continue;

        // Only enrich if openalex_id is missing
        if (author.openalex_id) continue;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: Record<string, any> = {};
        let didSomething = false;

        // openalex_id
        if (!author.openalex_id && oaAuthorship.author.id) {
          updates.openalex_id = oaAuthorship.author.id;
          updates.openalex_enriched_at = new Date().toISOString();
          updates.geo_source = "openalex";
          batchAuthorsOaId++;
          didSomething = true;
        }

        // ror_id
        const primaryInst = oaAuthorship.institutions[0];
        if (!author.ror_id && primaryInst?.ror) {
          updates.ror_id = primaryInst.ror;
          updates.ror_enriched_at = new Date().toISOString();
          updates.institution_type = primaryInst.type || null;
          batchAuthorsRor++;
          didSomething = true;
        }

        // orcid
        if (!author.orcid && oaAuthorship.author.orcid) {
          updates.orcid = oaAuthorship.author.orcid;
          updates.orcid_enriched_at = new Date().toISOString();
          batchAuthorsOrcid++;
          didSomething = true;
        }

        if (didSomething && !DRY_RUN) {
          await admin.from("authors").update(updates).eq("id", author.id);
        }
      }
    }

    totalArticlesEnriched += batchArticles;
    totalAuthorsOpenalexId += batchAuthorsOaId;
    totalAuthorsRorId += batchAuthorsRor;
    totalAuthorsOrcid += batchAuthorsOrcid;

    console.log(
      `Batch ${batchNum}: ${batchArticles}/${articles.length} articles found in OpenAlex, ` +
      `${batchAuthorsOaId} authors +openalex_id, ${batchAuthorsRor} +ror_id, ${batchAuthorsOrcid} +orcid`
    );

    if (articles.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
    await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }

  console.log(`\n=== ${DRY_RUN ? "DRY RUN " : ""}Summary ===`);
  console.log(`  Articles enriched:           ${totalArticlesEnriched}`);
  console.log(`  Authors + openalex_id:       ${totalAuthorsOpenalexId}`);
  console.log(`  Authors + ror_id:            ${totalAuthorsRorId}`);
  console.log(`  Authors + orcid (new):       ${totalAuthorsOrcid}`);
  console.log(`  Batches processed:           ${batchNum}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
