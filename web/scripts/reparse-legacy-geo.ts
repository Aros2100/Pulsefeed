/**
 * Re-parse legacy articles through the v2 geo pipeline.
 *
 * Processes articles where geo_class IS NULL (never parsed by the new pipeline),
 * newest first. Mirrors the author-linker write logic exactly.
 * Idempotent: skips articles where article_geo_metadata.parser_processed_at
 * is already set.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/reparse-legacy-geo.ts          # default 1000
 *   npx tsx scripts/reparse-legacy-geo.ts 500      # custom batch size
 */

import { createClient } from "@supabase/supabase-js";
import { determineArticleGeo } from "../src/lib/import/author-import/find-or-create";
import { enrichArticleAddresses } from "../src/lib/geo/v2/address-enrichment";
import { getRegion, getContinent } from "../src/lib/geo/country-map";
import pLimit from "p-limit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
) as any;

const CONCURRENCY = 5;
const batchSize   = parseInt(process.argv[2] ?? "1000", 10) || 1000;

const GEO_PARSER_B_VERSION = "v1.0";
const GEO_PARSER_VERSION   = "v2.0";

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAffiliation(authors: unknown): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a0 = (Array.isArray(authors) && authors[0]) as any;
  if (!a0) return null;
  return (
    (Array.isArray(a0.affiliations) && a0.affiliations[0]) ||
    (typeof a0.affiliation === "string" && a0.affiliation) ||
    null
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Re-parsing legacy geo — batch size: ${batchSize}, concurrency: ${CONCURRENCY}`);

  // 1. Fetch articles with geo_class IS NULL and at least one affiliation
  const { data: articles, error: fetchErr } = await db
    .from("articles")
    .select("id, pubmed_id, authors, pubmed_indexed_at")
    .is("geo_class", null)
    .not("authors", "is", null)
    .order("pubmed_indexed_at", { ascending: false })
    .limit(batchSize);

  if (fetchErr || !articles) throw new Error(fetchErr?.message ?? "fetch failed");

  // Filter: only those with a usable affiliation
  type ArticleRow = { id: string; pubmed_id: string; authors: unknown; pubmed_indexed_at: string };
  const candidates = (articles as ArticleRow[]).filter(
    (a) => extractAffiliation(a.authors) !== null
  );
  console.log(`Fetched ${articles.length} articles, ${candidates.length} with affiliation\n`);

  // 2. Check which already have parser_processed_at set (idempotency guard)
  const { data: existingMeta } = await db
    .from("article_geo_metadata")
    .select("article_id")
    .in("article_id", candidates.map((a) => a.id))
    .not("parser_processed_at", "is", null);

  const alreadyDone = new Set(
    ((existingMeta ?? []) as Array<{ article_id: string }>).map((r) => r.article_id)
  );
  const toProcess = candidates.filter((a) => !alreadyDone.has(a.id));

  console.log(`Skipping ${alreadyDone.size} already processed, running ${toProcess.length}\n`);

  // 3. Process concurrently
  let classA = 0, classB = 0, classC = 0, errors = 0, withRows = 0;
  const errorIds: string[] = [];
  let done = 0;

  const limiter = pLimit(CONCURRENCY);

  await Promise.all(
    toProcess.map((article) =>
      limiter(async () => {
        const aff = extractAffiliation(article.authors)!;
        const author = { lastName: "", foreName: "", affiliations: [aff], orcid: null };

        let geoResult;
        try {
          geoResult = await determineArticleGeo(db, author, null);
        } catch (e) {
          errors++;
          errorIds.push(article.pubmed_id);
          done++;
          process.stdout.write(`\r  [${done}/${toProcess.length}] A=${classA} B=${classB} C=${classC} err=${errors}  `);
          return;
        }

        const now = new Date().toISOString();

        // ── Write geo_class to articles ──
        await db.from("articles").update({ geo_class: geoResult.geo_class }).eq("id", article.id);

        // ── Class A: position=1 row ──
        if (geoResult.geo_class === "A" && geoResult.geo_country) {
          await db.from("article_geo_addresses").delete().eq("article_id", article.id);
          await db.from("article_geo_addresses").insert({
            article_id:            article.id,
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
          await enrichArticleAddresses(article.id);
          classA++;
          withRows++;
        }

        // ── Class B: N rows ──
        else if (geoResult.geo_class === "B" && geoResult.class_b_addresses) {
          await db.from("article_geo_addresses").delete().eq("article_id", article.id);
          await db.from("article_geo_addresses").insert(
            geoResult.class_b_addresses.map((addr) => ({
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
            }))
          );
          await enrichArticleAddresses(article.id);
          classB++;
          withRows++;
        } else {
          classC++;
        }

        // ── Metadata upsert ──
        await db.from("article_geo_metadata").upsert({
          article_id:            article.id,
          geo_confidence:        geoResult.geo_confidence,
          parser_processed_at:   now,
          parser_version:        geoResult.geo_class === "B" ? GEO_PARSER_B_VERSION : GEO_PARSER_VERSION,
          enriched_at:           geoResult.enriched_state_source ? now : null,
          enriched_state_source: geoResult.enriched_state_source,
          class_b_address_count: geoResult.geo_class === "B" ? geoResult.class_b_addresses?.length ?? null : null,
          updated_at:            now,
        }, { onConflict: "article_id" });

        done++;
        process.stdout.write(`\r  [${done}/${toProcess.length}] A=${classA} B=${classB} C=${classC} err=${errors}  `);
      })
    )
  );

  console.log("\n");

  // 4. Rapport
  console.log("── Rapport ──");
  console.log(`  Processeret:       ${toProcess.length}`);
  console.log(`  Klasse A:          ${classA}  (${pct(classA, toProcess.length)})`);
  console.log(`  Klasse B:          ${classB}  (${pct(classB, toProcess.length)})`);
  console.log(`  Klasse C:          ${classC}  (${pct(classC, toProcess.length)})`);
  console.log(`  Med geo-rows:      ${withRows}  (${pct(withRows, toProcess.length)})`);
  console.log(`  Fejl:              ${errors}`);
  if (errorIds.length > 0) {
    console.log(`  Fejl-PMIDs:        ${errorIds.slice(0, 10).join(", ")}${errorIds.length > 10 ? " …" : ""}`);
  }

  // 5. Verificer DB-state
  const { count: metaCount } = await db
    .from("article_geo_metadata")
    .select("*", { count: "exact", head: true })
    .in("article_id", toProcess.slice(0, 50).map((a) => a.id))
    .not("parser_processed_at", "is", null);
  console.log(`\n  Metadata verificering: ${metaCount ?? 0}/${Math.min(50, toProcess.length)} af første 50 har parser_processed_at ✓`);

  // Overall totals from DB via aggregate counts
  const [{ count: totalA }, { count: totalB }, { count: totalC }, { count: nullCount }] = await Promise.all([
    db.from("articles").select("*", { count: "exact", head: true }).eq("geo_class", "A"),
    db.from("articles").select("*", { count: "exact", head: true }).eq("geo_class", "B"),
    db.from("articles").select("*", { count: "exact", head: true }).eq("geo_class", "C"),
    db.from("articles").select("*", { count: "exact", head: true }).is("geo_class", null),
  ]);
  console.log(`\n── DB totals ──`);
  console.log(`  A: ${totalA ?? 0}   B: ${totalB ?? 0}   C: ${totalC ?? 0}`);
  console.log(`  Stadig geo_class=NULL: ${nullCount ?? 0}`);
}

function pct(n: number, total: number): string {
  return total === 0 ? "—" : `${((n / total) * 100).toFixed(1)}%`;
}

main().catch((e) => { console.error(e); process.exit(1); });
