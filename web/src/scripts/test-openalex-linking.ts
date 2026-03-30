/**
 * Quick smoke test: verify OpenAlex DOI lookup + author matching
 * without touching the DB (no linkAuthorsToArticle).
 *
 * Run with:
 *   cd web && npx tsx src/scripts/test-openalex-linking.ts
 */

// Load .env.local manually (no dotenv dependency)
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
import { fetchWorksByDois } from "@/lib/openalex/client";
import { matchPubMedToOpenAlex } from "@/lib/openalex/match-authors";
import { decodeHtmlEntities } from "@/lib/artikel-import/fetcher";

async function main() {
  const admin = createAdminClient();

  // 1. Fetch a small batch of unlinked articles
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: articles, error } = await (admin as any).rpc(
    "fetch_unlinked_articles",
    { p_offset: 0, p_limit: 3 }
  ) as { data: Array<{ id: string; pubmed_id: string; doi: string | null; authors: unknown }> | null; error: { message: string } | null };

  if (error) {
    console.error("RPC error:", error.message);
    process.exit(1);
  }

  const batch = articles ?? [];
  console.log(`\n=== Fetched ${batch.length} unlinked articles ===\n`);

  if (batch.length === 0) {
    console.log("No unlinked articles found. Nothing to test.");
    process.exit(0);
  }

  for (const a of batch) {
    console.log(`  PMID ${a.pubmed_id} | DOI: ${a.doi ?? "(none)"}`);
  }

  // 2. Batch DOI → OpenAlex lookup
  const doisInBatch = batch
    .filter((a): a is typeof a & { doi: string } => Boolean(a.doi))
    .map(a => a.doi);

  if (doisInBatch.length === 0) {
    console.log("\nNo articles with DOI in batch — cannot test OpenAlex lookup.");
    process.exit(0);
  }

  console.log(`\n=== OpenAlex batch lookup: ${doisInBatch.length} DOIs ===\n`);
  const oaWorksMap = await fetchWorksByDois(doisInBatch);
  console.log(`  Found: ${oaWorksMap.size}/${doisInBatch.length} works\n`);

  // 3. Log details for each work
  for (const article of batch) {
    if (!article.doi) continue;
    const work = oaWorksMap.get(article.doi.toLowerCase());
    if (!work) {
      console.log(`  PMID ${article.pubmed_id}: NOT found in OpenAlex`);
      continue;
    }

    const firstAuthorship = work.authorships[0];
    const firstInst = firstAuthorship?.institutions[0];
    console.log(`  PMID ${article.pubmed_id} → OpenAlex ${work.id}`);
    console.log(`    authorships: ${work.authorships.length}`);
    console.log(`    fwci: ${work.fwci ?? "n/a"}`);
    console.log(`    cited_by: ${work.citedByCount}`);
    console.log(`    first author: ${firstAuthorship?.author.displayName ?? "?"}`);
    console.log(`      institution: ${firstInst?.displayName ?? "?"}`);
    console.log(`      country: ${firstInst?.countryCode ?? "?"}`);
    console.log(`      ror: ${firstInst?.ror ?? "?"}`);
    console.log(`      orcid: ${firstAuthorship?.author.orcid ?? "none"}`);
    console.log();

    // 4. Match PubMed authors → OpenAlex authorships
    const rawAuthors = (article.authors ?? []) as Array<Record<string, unknown>>;
    const pubmedAuthors = rawAuthors.map(a => ({
      lastName: decodeHtmlEntities(String(a.lastName ?? "")),
      firstName: decodeHtmlEntities(String(a.foreName ?? "")),
    }));

    const matchMap = matchPubMedToOpenAlex(pubmedAuthors, work.authorships);
    console.log(`    Author matching: ${matchMap.size}/${pubmedAuthors.length} matched`);

    for (const [idx, oa] of matchMap) {
      const pm = pubmedAuthors[idx];
      console.log(`      [${idx}] "${pm.firstName} ${pm.lastName}" → "${oa.author.displayName}" (${oa.institutions[0]?.countryCode ?? "?"})`);
    }

    const unmatched = pubmedAuthors
      .map((pm, idx) => ({ pm, idx }))
      .filter(({ idx }) => !matchMap.has(idx));
    if (unmatched.length > 0) {
      console.log(`    Unmatched PubMed authors:`);
      for (const { pm, idx } of unmatched) {
        console.log(`      [${idx}] "${pm.firstName} ${pm.lastName}"`);
      }
    }
    console.log();
  }

  console.log("=== Done ===");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
