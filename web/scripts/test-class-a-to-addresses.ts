/**
 * Test: Klasse A skriver til article_geo_addresses (position=1 row)
 * samt bevarer flat geo_*-felter på articles (bagudkompatibilitet).
 *
 * Kører author-linker-flow (mirror) på 3 kendte Klasse A-PMIDs,
 * verificerer begge steder, og restorer snapshot bagefter.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/test-class-a-to-addresses.ts
 */

import { createClient } from "@supabase/supabase-js";
import { determineArticleGeo } from "../src/lib/import/author-import/find-or-create";
import { enrichArticleAddresses } from "../src/lib/geo/v2/address-enrichment";
import { getRegion, getContinent } from "../src/lib/geo/country-map";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
) as any;

const TEST_PMIDS = ["40690905", "41192315", "41783178"];

interface Snap {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  article:   any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata:  any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addresses: any[];
}

async function snapshot(articleId: string): Promise<Snap> {
  const [a, m, addrs] = await Promise.all([
    db.from("articles").select("*").eq("id", articleId).maybeSingle(),
    db.from("article_geo_metadata").select("*").eq("article_id", articleId).maybeSingle(),
    db.from("article_geo_addresses").select("*").eq("article_id", articleId),
  ]);
  return { article: a.data, metadata: m.data, addresses: addrs.data ?? [] };
}

async function restore(articleId: string, snap: Snap): Promise<void> {
  await db.from("article_geo_addresses").delete().eq("article_id", articleId);
  await db.from("article_geo_metadata").delete().eq("article_id", articleId);
  if (snap.article) {
    await db.from("articles").update({
      geo_class: snap.article.geo_class,
      geo_city: snap.article.geo_city, geo_country: snap.article.geo_country,
      geo_state: snap.article.geo_state, geo_region: snap.article.geo_region,
      geo_continent: snap.article.geo_continent,
      geo_institution: snap.article.geo_institution,
      geo_institution2: snap.article.geo_institution2,
      geo_institution3: snap.article.geo_institution3,
      geo_institutions_overflow: snap.article.geo_institutions_overflow,
      geo_department: snap.article.geo_department,
      geo_department2: snap.article.geo_department2,
      geo_department3: snap.article.geo_department3,
      geo_departments_overflow: snap.article.geo_departments_overflow,
      geo_source: snap.article.geo_source,
      geo_defined_at: snap.article.geo_defined_at,
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
    geo_region: null, geo_continent: null,
    geo_institution: null, geo_institution2: null, geo_institution3: null,
    geo_institutions_overflow: [],
    geo_department: null, geo_department2: null, geo_department3: null,
    geo_departments_overflow: [],
    geo_source: null, geo_defined_at: null, geo_parser_confidence: null,
  }).eq("id", articleId);
}

// Mirror author-linker Klasse A write
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runFlow(articleId: string, authors: unknown): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a0 = (Array.isArray(authors) && authors[0]) as any;
  const aff = a0
    ? (Array.isArray(a0.affiliations) ? a0.affiliations[0] : a0.affiliation)
    : null;
  const author = { lastName: "Test", foreName: "T", affiliations: aff ? [aff] : [], orcid: null };

  const geoResult = await determineArticleGeo(db, author, null);
  const now = new Date().toISOString();

  // 1. Flat write to articles (same as before)
  await db.from("articles").update({
    geo_class: geoResult.geo_class,
    geo_city: geoResult.geo_city, geo_country: geoResult.geo_country,
    geo_state: geoResult.geo_state, geo_region: geoResult.geo_region,
    geo_continent: geoResult.geo_continent,
    geo_institution: geoResult.geo_institution,
    geo_institution2: geoResult.geo_institution2,
    geo_institution3: geoResult.geo_institution3,
    geo_institutions_overflow: geoResult.geo_institutions_overflow,
    geo_department: geoResult.geo_department,
    geo_department2: geoResult.geo_department2,
    geo_department3: geoResult.geo_department3,
    geo_departments_overflow: geoResult.geo_departments_overflow,
    geo_source: geoResult.geo_source,
    geo_defined_at: now,
    geo_parser_confidence: geoResult.parser_confidence,
  }).eq("id", articleId);

  // 1b. Klasse A: also write position=1 to article_geo_addresses
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

  // Metadata upsert
  await db.from("article_geo_metadata").upsert({
    article_id: articleId,
    geo_class: geoResult.geo_class,
    geo_confidence: geoResult.geo_confidence,
    parser_processed_at: now,
    parser_version: geoResult.parser_version,
    updated_at: now,
  }, { onConflict: "article_id" });

  return geoResult;
}

async function main() {
  let passed = 0, failed = 0;

  for (const pmid of TEST_PMIDS) {
    console.log(`\n── PMID ${pmid} ──`);

    const { data: art } = await db.from("articles").select("id, authors").eq("pubmed_id", pmid).maybeSingle();
    if (!art) { console.log("  SKIP: article not found"); continue; }

    const snap = await snapshot(art.id);
    try {
      await reset(art.id);
      const geoResult = await runFlow(art.id, art.authors);

      // Verificer
      const [artRow, addrs] = await Promise.all([
        db.from("articles").select("geo_class, geo_country, geo_city, geo_state, geo_region, geo_continent, geo_institution").eq("id", art.id).maybeSingle(),
        db.from("article_geo_addresses").select("position, city, state, country, region, continent, institution, confidence, state_source").eq("article_id", art.id).order("position"),
      ]);

      const a = artRow.data;
      const rows = (addrs.data ?? []) as Array<{ position: number; city: string | null; state: string | null; country: string | null; region: string | null; continent: string | null; institution: string | null; confidence: string | null; state_source: string | null }>;

      let ok = true;
      const checks: string[] = [];

      // geo_class = 'A'
      if (a?.geo_class !== "A") { ok = false; checks.push(`geo_class=${a?.geo_class} (want A)`); }
      else checks.push(`geo_class=A ✓`);

      // Flat fields populated
      if (!a?.geo_country) { ok = false; checks.push("flat geo_country missing"); }
      else checks.push(`flat country=${a.geo_country} ✓`);

      // position=1 row exists in article_geo_addresses
      if (rows.length !== 1 || rows[0].position !== 1) {
        ok = false; checks.push(`addr rows=${rows.length} (want exactly 1 at position=1)`);
      } else {
        checks.push(`addr row position=1 ✓`);
        const r = rows[0];
        // region/continent set
        if (!r.region || !r.continent) { ok = false; checks.push(`region/continent missing on addr row`); }
        else checks.push(`region=${r.region}, continent=${r.continent} ✓`);
        // state_source
        const expectSource = r.state ? "parser" : null;
        const actualSource = r.state_source;
        // enrichment may have set it instead
        if (actualSource !== expectSource && actualSource !== "enrichment") {
          ok = false; checks.push(`state_source=${actualSource} (want parser|enrichment|null)`);
        } else {
          checks.push(`state_source=${actualSource ?? "null"} ✓`);
        }
        // country matches flat
        if (r.country !== a?.geo_country) { ok = false; checks.push(`addr country mismatch`); }
      }

      // region/continent also on flat articles
      if (geoResult.geo_class === "A" && geoResult.geo_country) {
        if (!a?.geo_region || !a?.geo_continent) {
          ok = false; checks.push("flat region/continent missing");
        } else checks.push(`flat region=${a.geo_region} ✓`);
      }

      for (const c of checks) console.log(`  ${c}`);
      console.log(ok ? "  PASS" : "  FAIL");
      if (ok) passed++; else failed++;
    } finally {
      await restore(art.id, snap);
      console.log(`  Restored snapshot`);
    }
  }

  console.log(`\n── Result: ${passed}/${TEST_PMIDS.length} passed, ${failed} failed ──`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
