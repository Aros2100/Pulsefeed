/**
 * Smoke-test: determineArticleGeo med Klasse B-detection.
 *
 * Dry-run — skriver intet til production-tabeller. Henter affiliations for
 * test-PMIDs, kalder determineArticleGeo, verificerer geo_class og struktur,
 * og simulerer hvad article_geo_addresses-rows ville indeholde (med region/continent).
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/test-author-linker-class-b.ts
 */

import { createClient } from "@supabase/supabase-js";
import { determineArticleGeo } from "../src/lib/import/author-import/find-or-create";
import { getRegion, getContinent } from "../src/lib/geo/country-map";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
) as any;

interface Case {
  pubmed_id:      string;
  expectClass:    "A" | "B" | "C";
  expectMinRows?: number;       // for B
}

const CASES: Case[] = [
  // Klasse B-kandidater fra lab-test (semicolon-separated multi-address)
  { pubmed_id: "38701548", expectClass: "B", expectMinRows: 2 },
  { pubmed_id: "41687733", expectClass: "B", expectMinRows: 2 },
  { pubmed_id: "24386122", expectClass: "B", expectMinRows: 2 },
  // Yderligere Klasse B fra tidligere lab-kørsler
  { pubmed_id: "39577911", expectClass: "B", expectMinRows: 2 },
  // Klasse A-kandidat (single-adresse) — tager en tilfældig fra articles
  { pubmed_id: "__class_a__", expectClass: "A" },
];

async function fetchAffiliation(pubmedId: string): Promise<{ pmid: string; affiliation: string } | null> {
  // Special token: hent en tilfældig artikel hvor authors[0].affiliation er Klasse A (ingen ;)
  if (pubmedId === "__class_a__") {
    const { data } = await db
      .from("articles")
      .select("pubmed_id, authors")
      .not("authors", "is", null)
      .limit(50);
    if (!data) return null;
    for (const row of data as Array<{ pubmed_id: string; authors: unknown }>) {
      const aff = (Array.isArray(row.authors) && row.authors[0]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? ((row.authors[0] as any).affiliation
            ?? (Array.isArray((row.authors[0] as any).affiliations)
                  ? (row.authors[0] as any).affiliations[0]
                  : null))
        : null) as string | null;
      if (aff && !aff.includes(";")) return { pmid: row.pubmed_id, affiliation: aff };
    }
    return null;
  }

  const { data } = await db
    .from("articles")
    .select("pubmed_id, authors")
    .eq("pubmed_id", pubmedId)
    .maybeSingle();
  if (!data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a0 = (Array.isArray(data.authors) && data.authors[0]) as any;
  const aff = a0
    ? (a0.affiliation ?? (Array.isArray(a0.affiliations) ? a0.affiliations[0] : null))
    : null;
  return aff ? { pmid: data.pubmed_id as string, affiliation: aff as string } : null;
}

function buildAuthor(affiliation: string) {
  return {
    lastName: "Test", foreName: "T",
    affiliations: [affiliation], orcid: null,
  };
}

async function main() {
  let passed = 0;
  let failed = 0;

  for (const tc of CASES) {
    const fetched = await fetchAffiliation(tc.pubmed_id);
    if (!fetched) {
      console.log(`SKIP  ${tc.pubmed_id}  (ingen affiliation fundet)`);
      continue;
    }

    const result = await determineArticleGeo(db, buildAuthor(fetched.affiliation), null);

    const classOk = result.geo_class === tc.expectClass;
    let rowsOk = true;
    let extras: string[] = [];

    if (tc.expectClass === "B") {
      const rows = result.class_b_addresses ?? [];
      const enoughRows = rows.length >= (tc.expectMinRows ?? 1);
      // Verificer flat geo_* er null
      const flatNull =
        result.geo_city === null && result.geo_country === null &&
        result.geo_state === null && result.geo_institution === null;
      if (!enoughRows) { rowsOk = false; extras.push(`rows=${rows.length} < ${tc.expectMinRows}`); }
      if (!flatNull)   { rowsOk = false; extras.push("flat geo_* ikke null"); }

      // Simuler region/continent-berigelse
      const enriched = rows.map((r) => ({
        position:  r.position,
        city:      r.city,
        country:   r.country,
        region:    r.country ? getRegion(r.country) : null,
        continent: r.country ? getContinent(r.country) : null,
        state_source: r.state ? "parser" : null,
      }));
      const allHaveContinent = enriched.every((r) => !r.country || r.continent !== null);
      if (!allHaveContinent) { rowsOk = false; extras.push("manglende continent på row med country"); }

      console.log(`${classOk && rowsOk ? "PASS" : "FAIL"}  PMID ${fetched.pmid}  class=${result.geo_class}  rows=${rows.length}`);
      if (rowsOk && classOk) {
        for (const r of enriched) {
          console.log(`        [${r.position}] ${r.city ?? "—"} / ${r.country ?? "—"}  region=${r.region ?? "—"}  continent=${r.continent ?? "—"}  state_source=${r.state_source ?? "null"}`);
        }
      }
    } else if (tc.expectClass === "A") {
      // Verificer flat geo_* er udfyldt (mindst country)
      const flatFilled = result.geo_country !== null;
      if (!flatFilled) { rowsOk = false; extras.push("geo_country er null på Klasse A"); }
      // Verificer ingen class_b_addresses
      if (result.class_b_addresses) { rowsOk = false; extras.push("class_b_addresses ikke null"); }

      console.log(`${classOk && rowsOk ? "PASS" : "FAIL"}  PMID ${fetched.pmid}  class=${result.geo_class}  city=${result.geo_city ?? "—"}  country=${result.geo_country ?? "—"}`);
    }

    if (classOk && rowsOk) passed++;
    else {
      failed++;
      if (!classOk) console.log(`        FORVENTET class=${tc.expectClass}, FIK class=${result.geo_class}`);
      extras.forEach((e) => console.log(`        ${e}`));
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
