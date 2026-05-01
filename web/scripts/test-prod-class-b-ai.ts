/**
 * Smoke-test: Klasse B AI batch end-to-end (synchronous variant).
 *
 * Da production-articles ikke har Klasse B-rows endnu, populerer vi først via
 * determineArticleGeo (samme flow som author-linker), kører AI synkront, og
 * rydder op til sidst.
 *
 * Steps for hver test-PMID:
 *   1. Find article_id fra pubmed_id
 *   2. Snapshot eksisterende article_geo_addresses-rows
 *   3. Slet eksisterende, kør determineArticleGeo + skriv Klasse B-rows
 *   4. Kald processArticleSync (Anthropic + applyClassBAiResult + enrichment)
 *   5. Verificer ai_processed_at, ai_action, state_source udfyldt
 *   6. Restore originale rows
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/test-prod-class-b-ai.ts
 */

import { createClient } from "@supabase/supabase-js";
import { processArticleSync } from "../src/lib/scoring/batch/article-geo-class-b-batch";
import { determineArticleGeo } from "../src/lib/import/author-import/find-or-create";
import { getRegion, getContinent } from "../src/lib/geo/country-map";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
) as any;

// Kendte Klasse B-PMIDs fra lab-test (verificeret af test-author-linker-class-b)
const TEST_PMIDS = ["38701548", "41687733", "24386122", "39577911"];

async function fetchArticle(pubmedId: string) {
  const { data } = await db.from("articles").select("id, authors").eq("pubmed_id", pubmedId).maybeSingle();
  return data;
}

async function snapshotRows(articleId: string): Promise<unknown[]> {
  const { data } = await db.from("article_geo_addresses").select("*").eq("article_id", articleId);
  return data ?? [];
}

async function restoreRows(articleId: string, snapshot: unknown[]) {
  await db.from("article_geo_addresses").delete().eq("article_id", articleId);
  if (snapshot.length > 0) await db.from("article_geo_addresses").insert(snapshot);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAuthor(authors: unknown): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a0 = (Array.isArray(authors) && authors[0]) as any;
  const aff = a0
    ? (a0.affiliation ?? (Array.isArray(a0.affiliations) ? a0.affiliations[0] : null))
    : null;
  return { lastName: "Test", foreName: "T", affiliations: aff ? [aff] : [], orcid: null };
}

async function main() {
  // Aktiv prompt
  const { data: promptRow } = await db
    .from("model_versions")
    .select("version, prompt_text")
    .eq("module", "article_geo_class_b").eq("active", true).maybeSingle();
  if (!promptRow) throw new Error("Ingen aktiv Klasse B-prompt");
  const promptVersion = promptRow.version as string;
  const promptText    = promptRow.prompt_text as string;
  console.log(`Prompt: article_geo_class_b ${promptVersion}\n`);

  let succeeded = 0, failed = 0, jsonErrors = 0;
  const aiActionDist:    Map<string, number> = new Map();
  const stateSourceDist: Map<string, number> = new Map();

  for (const pmid of TEST_PMIDS) {
    console.log(`── PMID ${pmid} ──`);
    const article = await fetchArticle(pmid);
    if (!article) { console.log(`  SKIP: artikel ikke fundet\n`); continue; }

    const snapshot = await snapshotRows(article.id);
    const author   = buildAuthor(article.authors);

    try {
      // 1. Pre-populer Klasse B-rows via determineArticleGeo (mirror author-linker)
      const geoResult = await determineArticleGeo(db, author, null);
      if (geoResult.geo_class !== "B" || !geoResult.class_b_addresses) {
        console.log(`  SKIP: parser returnerede geo_class=${geoResult.geo_class}\n`);
        await restoreRows(article.id, snapshot);
        continue;
      }

      await db.from("article_geo_addresses").delete().eq("article_id", article.id);
      await db.from("article_geo_addresses").insert(geoResult.class_b_addresses.map((addr) => ({
        article_id:            article.id,
        position:              addr.position,
        city:                  addr.city,
        state:                 addr.state,
        country:               addr.country,
        region:                addr.country ? getRegion(addr.country) : null,
        continent:             addr.country ? getContinent(addr.country) : null,
        institution:           addr.institution,
        institution2:          addr.institution2,
        institution3:          addr.institution3,
        institutions_overflow: addr.institutions_overflow,
        department:            addr.department,
        department2:           addr.department2,
        department3:           addr.department3,
        departments_overflow:  addr.departments_overflow,
        confidence:            addr.confidence,
        state_source:          addr.state ? "parser" : null,
      })));

      // Sørg for article_geo_metadata har parser_processed_at
      await db.from("article_geo_metadata").upsert({
        article_id:           article.id,
        parser_processed_at:  new Date().toISOString(),
        parser_version:       geoResult.parser_version,
        class_b_address_count: geoResult.class_b_addresses.length,
        updated_at:           new Date().toISOString(),
      }, { onConflict: "article_id" });

      console.log(`  Pre-populated: ${geoResult.class_b_addresses.length} parser-rows`);

      // 2. Kør AI synkront
      const { data: rows } = await db
        .from("article_geo_addresses")
        .select("id, position, city, state, country, institution, institution2, institution3, institutions_overflow, department, department2, department3, departments_overflow, confidence")
        .eq("article_id", article.id)
        .order("position");

      const result = await processArticleSync(
        db,
        { id: article.id, pubmed_id: pmid, affiliation_raw: author.affiliations[0],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rows: rows as any[] },
        promptText, promptVersion
      );

      if (!result.ok) {
        failed++;
        if (result.error?.includes("JSON")) jsonErrors++;
        console.log(`  FAIL (AI): ${result.error}\n`);
        continue;
      }

      // 3. Verificer
      const { data: afterRows } = await db
        .from("article_geo_addresses")
        .select("position, city, state, country, ai_action, ai_processed_at, state_source")
        .eq("article_id", article.id).order("position");
      const after = (afterRows ?? []) as Array<{ position: number; city: string | null; state: string | null; country: string | null; ai_action: string | null; ai_processed_at: string | null; state_source: string | null }>;

      const allProcessed = after.every((r) => r.ai_processed_at !== null);
      const { data: meta } = await db
        .from("article_geo_metadata")
        .select("ai_processed_at, ai_prompt_version, class_b_address_count")
        .eq("article_id", article.id).maybeSingle();
      const metaOk = meta?.ai_processed_at !== null && meta?.ai_prompt_version === promptVersion;

      for (const r of after) {
        aiActionDist.set(r.ai_action ?? "(null)", (aiActionDist.get(r.ai_action ?? "(null)") ?? 0) + 1);
        stateSourceDist.set(r.state_source ?? "(null)", (stateSourceDist.get(r.state_source ?? "(null)") ?? 0) + 1);
      }

      if (allProcessed && metaOk) {
        succeeded++;
        console.log(`  PASS (AI): ${result.addresses_in} → ${result.addresses_out} rows  changes=${result.changes?.length ?? 0}`);
        for (const r of after) {
          console.log(`        [${r.position}] ${r.city ?? "—"} / ${r.country ?? "—"}  state=${r.state ?? "null"}  src=${r.state_source ?? "null"}  action=${r.ai_action ?? "null"}`);
        }
      } else {
        failed++;
        console.log(`  FAIL: allProcessed=${allProcessed}  metaOk=${metaOk}`);
      }
    } finally {
      await restoreRows(article.id, snapshot);
      console.log(`  Restored ${snapshot.length} originale rows\n`);
    }
  }

  console.log(`── Resultat ──`);
  console.log(`  Succeeded: ${succeeded}/${TEST_PMIDS.length}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  JSON-fejl: ${jsonErrors}`);

  console.log(`\n── ai_action-fordeling ──`);
  for (const [k, v] of [...aiActionDist.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(12)} ${v}`);
  }
  console.log(`\n── state_source-fordeling ──`);
  for (const [k, v] of [...stateSourceDist.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(12)} ${v}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
