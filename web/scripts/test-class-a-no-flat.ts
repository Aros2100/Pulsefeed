/**
 * Test: Klasse A skriver KUN til article_geo_addresses (ingen flat geo_*-felter).
 *
 * Verificerer:
 *   - articles.geo_class = 'A'
 *   - articles.geo_country, geo_city osv. = NULL
 *   - article_geo_addresses har 1 row (position=1) med udfyldte felter
 *   - article_geo_metadata opdateret
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/test-class-a-no-flat.ts
 */

import { createClient } from "@supabase/supabase-js";
import { determineArticleGeo } from "../src/lib/import/author-import/find-or-create";
import { enrichArticleAddresses } from "../src/lib/geo/v2/address-enrichment";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
) as any;

const TEST_PMIDS = ["40690905", "41192315", "41783178"];

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
      geo_source: snap.article.geo_source, geo_defined_at: snap.article.geo_defined_at,
      geo_parser_confidence: snap.article.geo_parser_confidence,
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

async function runFlow(articleId: string, authors: unknown): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a0 = (Array.isArray(authors) && authors[0]) as any;
  const aff = a0
    ? (Array.isArray(a0.affiliations) ? a0.affiliations[0] : a0.affiliation)
    : null;
  const author = { lastName: "T", foreName: "T", affiliations: aff ? [aff] : [], orcid: null };

  const geoResult = await determineArticleGeo(db, author, null);
  const now = new Date().toISOString();

  // Mirror new author-linker: only geo_class on articles
  await db.from("articles").update({ geo_class: geoResult.geo_class }).eq("id", articleId);

  if (geoResult.geo_class === "A" && geoResult.geo_country) {
    await db.from("article_geo_addresses").delete().eq("article_id", articleId);
    await db.from("article_geo_addresses").insert({
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

  await db.from("article_geo_metadata").upsert({
    article_id: articleId,
    geo_class: geoResult.geo_class,
    geo_confidence: geoResult.geo_confidence,
    parser_processed_at: now,
    parser_version: geoResult.parser_version,
    updated_at: now,
  }, { onConflict: "article_id" });
}

async function main() {
  let passed = 0, failed = 0;

  for (const pmid of TEST_PMIDS) {
    console.log(`── PMID ${pmid} ──`);
    const { data: art } = await db.from("articles").select("id, authors").eq("pubmed_id", pmid).maybeSingle();
    if (!art) { console.log("  SKIP: not found"); continue; }

    const snap = await snapshot(art.id);
    try {
      await reset(art.id);
      await runFlow(art.id, art.authors);

      const [a, addrs, meta] = await Promise.all([
        db.from("articles").select("geo_class, geo_country, geo_city, geo_state, geo_region, geo_continent, geo_institution").eq("id", art.id).maybeSingle(),
        db.from("article_geo_addresses").select("position, country, city, state, region, continent, institution, state_source").eq("article_id", art.id),
        db.from("article_geo_metadata").select("geo_class, parser_processed_at").eq("article_id", art.id).maybeSingle(),
      ]);

      const article = a.data;
      const rows = (addrs.data ?? []) as Array<{ position: number; country: string | null; city: string | null; state: string | null; region: string | null; continent: string | null; institution: string | null; state_source: string | null }>;

      let ok = true;
      const checks: string[] = [];

      // geo_class = 'A'
      if (article?.geo_class !== "A") { ok = false; checks.push(`FAIL geo_class=${article?.geo_class}`); }
      else checks.push(`geo_class=A ✓`);

      // Flat geo_* MUST be null
      const flatFields = ["geo_country", "geo_city", "geo_state", "geo_region", "geo_continent", "geo_institution"] as const;
      const nonNull = flatFields.filter((f) => article?.[f] !== null && article?.[f] !== undefined);
      if (nonNull.length > 0) { ok = false; checks.push(`FAIL flat non-null: ${nonNull.join(", ")}`); }
      else checks.push(`flat geo_* all null ✓`);

      // article_geo_addresses: exactly 1 row at position=1
      if (rows.length !== 1 || rows[0].position !== 1) {
        ok = false; checks.push(`FAIL addr rows=${rows.length}`);
      } else {
        const r = rows[0];
        if (!r.country) { ok = false; checks.push("FAIL addr row missing country"); }
        else checks.push(`addr row: country=${r.country}, city=${r.city ?? "—"}, region=${r.region ?? "—"} ✓`);
        if (r.state_source !== "parser" && r.state_source !== "enrichment" && r.state !== null) {
          ok = false; checks.push(`FAIL state_source=${r.state_source}`);
        } else {
          checks.push(`state_source=${r.state_source ?? "null"} ✓`);
        }
      }

      // article_geo_metadata updated
      if (!meta.data?.parser_processed_at) { ok = false; checks.push("FAIL metadata not updated"); }
      else checks.push(`metadata updated ✓`);

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
