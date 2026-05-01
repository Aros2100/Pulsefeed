/**
 * Test: Klasse A AI-batch skriver til article_geo_addresses.
 *
 * Pre-populates Class A articles med address rows, finder kandidater via RPC,
 * kører synkron AI, verificerer at article_geo_addresses er opdateret og
 * at articles.geo_*-flat-felter forbliver null.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/test-class-a-ai-new-flow.ts
 */

import { createClient } from "@supabase/supabase-js";
import { determineArticleGeo } from "../src/lib/import/author-import/find-or-create";
import { enrichArticleAddresses } from "../src/lib/geo/v2/address-enrichment";
import {
  processArticleGeoASync,
  type PrepareOptions,
} from "../src/lib/scoring/batch/article-geo-class-a-batch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
) as any;

// ── Snapshot / restore ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function snapshot(articleId: string): Promise<any> {
  const [a, m, addrs] = await Promise.all([
    db.from("articles").select("*").eq("id", articleId).maybeSingle(),
    db.from("article_geo_metadata").select("*").eq("article_id", articleId).maybeSingle(),
    db.from("article_geo_addresses").select("*").eq("article_id", articleId),
  ]);
  return { article: a.data, metadata: m.data, addresses: addrs.data ?? [] };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function restore(articleId: string, snap: any): Promise<void> {
  await db.from("article_geo_addresses").delete().eq("article_id", articleId);
  await db.from("article_geo_metadata").delete().eq("article_id", articleId);
  if (snap.article) {
    await db.from("articles").update({
      geo_class: snap.article.geo_class,
      geo_city: snap.article.geo_city, geo_country: snap.article.geo_country,
      geo_state: snap.article.geo_state, geo_region: snap.article.geo_region,
      geo_continent: snap.article.geo_continent,
      geo_institution: snap.article.geo_institution,
      geo_source: snap.article.geo_source,
    }).eq("id", articleId);
  }
  if (snap.metadata) {
    await db.from("article_geo_metadata").upsert(snap.metadata, { onConflict: "article_id" });
  }
  if (snap.addresses.length > 0) {
    await db.from("article_geo_addresses").insert(snap.addresses);
  }
}

async function reset(articleId: string): Promise<void> {
  await db.from("article_geo_addresses").delete().eq("article_id", articleId);
  await db.from("article_geo_metadata").delete().eq("article_id", articleId);
  await db.from("articles").update({
    geo_class: null, geo_city: null, geo_country: null, geo_state: null,
    geo_region: null, geo_continent: null, geo_institution: null,
    geo_source: null, geo_defined_at: null, geo_parser_confidence: null,
  }).eq("id", articleId);
}

// Mirror author-linker Class A write (without flat fields)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function populateClassARow(articleId: string, authors: unknown): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a0 = (Array.isArray(authors) && authors[0]) as any;
  const aff = a0
    ? (Array.isArray(a0.affiliations) ? a0.affiliations[0] : a0.affiliation)
    : null;
  const author = { lastName: "T", foreName: "T", affiliations: aff ? [aff] : [], orcid: null };

  const geoResult = await determineArticleGeo(db, author, null);
  if (geoResult.geo_class !== "A" || !geoResult.geo_country) return null;

  const now = new Date().toISOString();
  await db.from("articles").update({ geo_class: "A" }).eq("id", articleId);

  await db.from("article_geo_addresses").delete().eq("article_id", articleId);
  const { data: insertedRow } = await db.from("article_geo_addresses").insert({
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
  }).select("id").single();

  await enrichArticleAddresses(articleId);
  await db.from("article_geo_metadata").upsert({
    article_id: articleId,
    geo_class: "A",
    geo_confidence: geoResult.geo_confidence,
    parser_processed_at: now,
    parser_version: geoResult.parser_version,
    updated_at: now,
  }, { onConflict: "article_id" });

  return (insertedRow as { id: string } | null)?.id ?? null;
}

async function main() {
  // 1. Hent aktiv Klasse A-prompt
  const { data: promptRow } = await db
    .from("model_versions").select("version, prompt_text")
    .eq("module", "article_geo_class_a").eq("active", true).maybeSingle();
  if (!promptRow) throw new Error("No active article_geo_class_a prompt");
  const promptVersion = promptRow.version as string;
  const promptText    = promptRow.prompt_text as string;
  console.log(`Prompt: article_geo_class_a ${promptVersion}\n`);

  // 2. Brug kendte Klasse A-PMIDs
  const TEST_PMIDS = ["40690905", "41192315", "41783178"];
  let passed = 0, failed = 0;

  for (const pmid of TEST_PMIDS) {
    console.log(`── PMID ${pmid} ──`);
    const { data: art } = await db.from("articles").select("id, authors").eq("pubmed_id", pmid).maybeSingle();
    if (!art) { console.log("  SKIP: not found\n"); continue; }

    const snap = await snapshot(art.id);
    try {
      await reset(art.id);
      const addrRowId = await populateClassARow(art.id, art.authors);
      if (!addrRowId) { console.log("  SKIP: not Class A or no country\n"); continue; }
      console.log(`  Populated addr row ${addrRowId}`);

      // 3. Kald RPC for at bekræfte artiklen er kandidat
      const { data: candidates } = await db.rpc("get_article_geo_class_a_candidates", {
        p_limit: 1000, p_edat_from: null, p_edat_to: null,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const candidate = ((candidates ?? []) as any[]).find((c) => c.id === art.id);
      if (!candidate) {
        console.log("  INFO: not a candidate (parser already found all fields) — testing AI anyway");
      } else {
        console.log(`  RPC candidate ✓ city=${candidate.city ?? "null"} state=${candidate.state ?? "null"}`);
      }

      // Build article row for sync call
      const { data: addrRow } = await db
        .from("article_geo_addresses")
        .select("id, city, state, country, region, continent, institution, institution2, institution3, institutions_overflow, department, department2, department3, departments_overflow, confidence")
        .eq("article_id", art.id).eq("position", 1).maybeSingle();

      const articleForAI = {
        id:                    art.id,
        pubmed_id:             pmid,
        affiliation_raw:       ((Array.isArray(art.authors) && (art.authors[0] as { affiliations?: string[]; affiliation?: string }))
          ? ((art.authors[0] as { affiliations?: string[] }).affiliations?.[0] ??
             (art.authors[0] as { affiliation?: string }).affiliation ?? null)
          : null),
        geo_class:             "A",
        addr_row_id:           addrRowId,
        city:                  addrRow?.city,
        state:                 addrRow?.state,
        country:               addrRow?.country,
        region:                addrRow?.region,
        continent:             addrRow?.continent,
        institution:           addrRow?.institution,
        institution2:          addrRow?.institution2,
        institution3:          addrRow?.institution3,
        institutions_overflow: addrRow?.institutions_overflow ?? [],
        department:            addrRow?.department,
        department2:           addrRow?.department2,
        department3:           addrRow?.department3,
        departments_overflow:  addrRow?.departments_overflow ?? [],
        confidence:            addrRow?.confidence,
        geo_confidence:        null,
      };

      // 4. Kør AI synkront
      const result = await processArticleGeoASync(db, articleForAI, promptText, promptVersion);
      if (!result.ok) { console.log(`  FAIL AI: ${result.error}`); failed++; continue; }
      console.log(`  AI ran: changes=${result.changes?.length ?? 0}`);

      // 5. Verificer
      const [afterAddr, afterArticle, afterMeta] = await Promise.all([
        db.from("article_geo_addresses").select("ai_processed_at, ai_action, ai_changes, state_source, country, city").eq("id", addrRowId).maybeSingle(),
        db.from("articles").select("geo_class, geo_country, geo_city, geo_state").eq("id", art.id).maybeSingle(),
        db.from("article_geo_metadata").select("ai_processed_at, ai_prompt_version").eq("article_id", art.id).maybeSingle(),
      ]);

      let ok = true;
      const checks: string[] = [];

      // addr row: ai_processed_at set
      if (!afterAddr.data?.ai_processed_at) { ok = false; checks.push("FAIL addr ai_processed_at not set"); }
      else checks.push(`addr ai_processed_at ✓`);

      // addr row: ai_action = 'kept'
      if (afterAddr.data?.ai_action !== "kept") { ok = false; checks.push(`FAIL ai_action=${afterAddr.data?.ai_action}`); }
      else checks.push(`addr ai_action=kept ✓`);

      // flat articles.geo_* still null
      if (afterArticle.data?.geo_country !== null) {
        ok = false; checks.push(`FAIL flat geo_country=${afterArticle.data?.geo_country} (should be null)`);
      } else checks.push(`flat geo_* null ✓`);

      // geo_class still 'A'
      if (afterArticle.data?.geo_class !== "A") { ok = false; checks.push(`FAIL geo_class=${afterArticle.data?.geo_class}`); }
      else checks.push(`geo_class=A ✓`);

      // metadata ai_processed_at
      if (!afterMeta.data?.ai_processed_at) { ok = false; checks.push("FAIL metadata ai_processed_at not set"); }
      else checks.push(`metadata ai_processed_at ✓`);

      // state_source valid
      const src = afterAddr.data?.state_source;
      if (src !== null && src !== "parser" && src !== "ai" && src !== "enrichment") {
        ok = false; checks.push(`FAIL state_source=${src}`);
      } else checks.push(`state_source=${src ?? "null"} ✓`);

      for (const c of checks) console.log(`  ${c}`);
      console.log(ok ? "  PASS" : "  FAIL");
      if (ok) passed++; else failed++;
    } finally {
      await restore(art.id, snap);
      console.log(`  Restored\n`);
    }
  }

  console.log(`── ${passed}/${TEST_PMIDS.length} passed ──`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
