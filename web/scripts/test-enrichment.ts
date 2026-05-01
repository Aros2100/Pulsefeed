/**
 * Smoke-test: enrichArticleAddresses (state enrichment via geo_cities).
 *
 * Tester enrichment-funktionen direkte med syntetiske rows:
 *   1. Find en eksisterende Klasse B-artikel (har rows i article_geo_addresses)
 *   2. Indsæt test-rows med kendte city/country men state=null
 *   3. Kør enrichArticleAddresses
 *   4. Verificer state er udfyldt med state_source='enrichment'
 *   5. Ryd op (slet test-rows, gendan original tilstand)
 *
 * Kendte city/state-par der ALTID er i geo_cities:
 *   - Montreal / Canada   → Quebec
 *   - Angers / France     → Pays de la Loire
 *   - Edinburgh / United Kingdom → Scotland
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/test-enrichment.ts
 */

import { createClient } from "@supabase/supabase-js";
import { enrichArticleAddresses } from "../src/lib/geo/v2/address-enrichment";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
) as any;

interface TestRow {
  city:            string;
  country:         string;
  expectedState:   string;
}

const TEST_ROWS: TestRow[] = [
  { city: "Montreal",  country: "Canada",         expectedState: "Quebec" },
  { city: "Angers",    country: "France",          expectedState: "Pays de la Loire" },
  { city: "Edinburgh", country: "United Kingdom",  expectedState: "Scotland" },
];

async function findAnyArticleId(): Promise<string | null> {
  // Find en artikel med eksisterende geo_addresses-rows (Klasse B)
  const { data } = await db
    .from("article_geo_addresses")
    .select("article_id")
    .limit(1);
  return (data?.[0]?.article_id as string) ?? null;
}

async function findAnyArticleIdFallback(): Promise<string | null> {
  // Fallback: find en hvilken som helst artikel
  const { data } = await db
    .from("articles")
    .select("id")
    .limit(1);
  return (data?.[0]?.id as string) ?? null;
}

async function main() {
  let passed = 0;
  let failed = 0;

  // Find artikel at hæfte test-rows på
  const articleId = (await findAnyArticleId()) ?? (await findAnyArticleIdFallback());
  if (!articleId) {
    console.error("Ingen artikel fundet — afbryder.");
    process.exit(1);
  }
  console.log(`Bruger article_id=${articleId} til syntetiske test-rows\n`);

  // Indsæt syntetiske test-rows med høj position (9000+) for ikke at kollidere
  const insertedIds: string[] = [];
  for (let i = 0; i < TEST_ROWS.length; i++) {
    const row = TEST_ROWS[i];
    const { data, error } = await db
      .from("article_geo_addresses")
      .insert({
        article_id:            articleId,
        position:              9000 + i,
        city:                  row.city,
        country:               row.country,
        state:                 null,
        state_source:          null,
        institutions_overflow: [],
        departments_overflow:  [],
        confidence:            "high",
      })
      .select("id")
      .single();
    if (error) {
      console.error(`FEJL ved insert af test-row ${i}: ${error.message}`);
      process.exit(1);
    }
    insertedIds.push(data.id as string);
  }
  console.log(`Indsat ${insertedIds.length} syntetiske test-rows med state=null\n`);

  try {
    // Kør enrichment
    const result = await enrichArticleAddresses(articleId);
    console.log(`Enrichment kørt: total_rows=${result.total_rows}  enriched=${result.enriched}  unchanged=${result.unchanged}  errors=${result.errors}\n`);

    // Hent og verificer de syntetiske rows
    const { data: afterRows } = await db
      .from("article_geo_addresses")
      .select("id, city, state, state_source")
      .in("id", insertedIds);

    for (let i = 0; i < TEST_ROWS.length; i++) {
      const exp = TEST_ROWS[i];
      const got = (afterRows ?? []).find((r: { id: string }) => r.id === insertedIds[i]) as
        { id: string; city: string; state: string | null; state_source: string | null } | undefined;

      if (!got) {
        console.log(`FAIL  city=${exp.city}: row ikke fundet efter enrichment`);
        failed++;
        continue;
      }

      const stateOk  = got.state === exp.expectedState;
      const sourceOk = got.state_source === "enrichment";

      if (stateOk && sourceOk) {
        console.log(`PASS  city=${exp.city}  state="${got.state}"  state_source="${got.state_source}"`);
        passed++;
      } else {
        console.log(`FAIL  city=${exp.city}`);
        if (!stateOk)  console.log(`      state:        forventet="${exp.expectedState}"  fik="${got.state}"`);
        if (!sourceOk) console.log(`      state_source: forventet="enrichment"  fik="${got.state_source}"`);
        failed++;
      }
    }

  } finally {
    // Ryd altid op
    if (insertedIds.length > 0) {
      await db.from("article_geo_addresses").delete().in("id", insertedIds);
      console.log(`\nRyddet op: ${insertedIds.length} test-rows slettet.`);
    }
  }

  console.log(`\n── Resultat: ${passed}/${TEST_ROWS.length} passed${failed > 0 ? `  (${failed} FAILED)` : ""} ──`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
