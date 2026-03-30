/**
 * Test OpenAlex lookup on known articles that already have authors.
 *
 * Run with:
 *   cd web && npx tsx src/scripts/test-openalex-known.ts
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
import { fetchWorkByDoi } from "@/lib/openalex/client";
import { matchPubMedToOpenAlex } from "@/lib/openalex/match-authors";
import { decodeHtmlEntities } from "@/lib/artikel-import/fetcher";

async function main() {
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: articles, error } = await (admin as any)
    .from("articles")
    .select("id, pubmed_id, doi, title, authors")
    .not("doi", "is", null)
    .neq("authors", "[]")
    .limit(5);

  if (error) {
    console.error("Query error:", error.message);
    process.exit(1);
  }

  console.log(`\n=== Testing ${articles.length} articles with DOI ===\n`);

  for (const article of articles) {
    const rawAuthors = (article.authors ?? []) as Array<Record<string, unknown>>;
    console.log(`--- PMID ${article.pubmed_id} ---`);
    console.log(`  Title: ${(article.title as string).slice(0, 80)}...`);
    console.log(`  DOI: ${article.doi}`);
    console.log(`  PubMed authors: ${rawAuthors.length}`);

    const work = await fetchWorkByDoi(article.doi);
    if (!work) {
      console.log(`  OpenAlex: NOT FOUND\n`);
      continue;
    }

    console.log(`  OpenAlex: ${work.id} | ${work.authorships.length} authorships | fwci=${work.fwci ?? "n/a"} | cited=${work.citedByCount}`);

    const pubmedAuthors = rawAuthors.map(a => ({
      lastName: decodeHtmlEntities(String(a.lastName ?? "")),
      firstName: decodeHtmlEntities(String(a.foreName ?? "")),
    }));

    const matchMap = matchPubMedToOpenAlex(pubmedAuthors, work.authorships);
    console.log(`  Matched: ${matchMap.size}/${pubmedAuthors.length}`);

    for (const [idx, oa] of matchMap) {
      const pm = pubmedAuthors[idx];
      const inst = oa.institutions[0];
      console.log(
        `    [${idx}] "${pm.firstName} ${pm.lastName}" → ` +
        `${oa.author.id} "${oa.author.displayName}" | ` +
        `${inst?.displayName ?? "no inst"} (${inst?.countryCode ?? "?"}) | ` +
        `ror=${inst?.ror ?? "none"} | orcid=${oa.author.orcid ?? "none"}`
      );
    }

    const unmatched = pubmedAuthors
      .map((pm, idx) => ({ pm, idx }))
      .filter(({ idx }) => !matchMap.has(idx));
    if (unmatched.length > 0) {
      console.log(`  Unmatched:`);
      for (const { pm, idx } of unmatched) {
        console.log(`    [${idx}] "${pm.firstName} ${pm.lastName}"`);
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
