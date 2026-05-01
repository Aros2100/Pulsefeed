/**
 * Kør Klasse B-parseren (one-to-many) mod alle 71 Klasse C-artikler i
 * geo_parser_run_1000 og skriv resultater til geo_addresses_lab.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/test-class-b-rows.ts
 */

import { createClient } from "@supabase/supabase-js";
import { parseClassB } from "../src/admin/lab/geo-validation/parser-class-b/affiliation-parser-b";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
) as any;

async function main() {
  // ── 1. Hent alle Klasse C-artikler ───────────────────────────────────────
  console.log("Henter Klasse C-artikler fra geo_parser_run_1000...");
  const { data, error } = await db
    .from("geo_parser_run_1000")
    .select("pubmed_id, affiliation")
    .eq("lab_class", "C")
    .not("affiliation", "is", null);

  if (error || !data) throw new Error(error?.message ?? "no data");
  const rows = data as Array<{ pubmed_id: string; affiliation: string }>;
  console.log(`Hentet ${rows.length} artikler.\n`);

  // ── 2. Parse og byg insert-payload ──────────────────────────────────────
  let klasseB = 0;
  let stillC  = 0;
  let insertErrors = 0;
  let totalRows = 0;

  // Collect sample articles (first 5 that become Klasse B)
  const sampleArticles: Array<{ pubmed_id: string; affiliation: string; rows: ReturnType<Awaited<ReturnType<typeof parseClassB>>> }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    process.stdout.write(`\r  [${i + 1}/${rows.length}] ${row.pubmed_id}          `);

    let result: Awaited<ReturnType<typeof parseClassB>>;
    try {
      result = await parseClassB(row.affiliation);
    } catch (e) {
      console.error(`\n  Parse-fejl for ${row.pubmed_id}: ${(e as Error).message}`);
      stillC++;
      continue;
    }

    if (result === null) {
      stillC++;
      continue;
    }

    // Slet evt. eksisterende rows (idempotent re-run)
    await db.from("geo_addresses_lab").delete().eq("pubmed_id", row.pubmed_id);

    // Insert alle address-rows
    const insertRows = result.map((addr) => ({
      pubmed_id:             row.pubmed_id,
      position:              addr.position,
      city:                  addr.city,
      state:                 addr.state,
      country:               addr.country,
      institution:           addr.institution,
      institution2:          addr.institution2,
      institution3:          addr.institution3,
      institutions_overflow: addr.institutions_overflow,
      department:            addr.department,
      department2:           addr.department2,
      department3:           addr.department3,
      departments_overflow:  addr.departments_overflow,
      confidence:            addr.confidence,
    }));

    const { error: insErr } = await db.from("geo_addresses_lab").insert(insertRows);
    if (insErr) {
      insertErrors++;
      console.error(`\n  Insert-fejl for ${row.pubmed_id}: ${insErr.message}`);
      continue;
    }

    klasseB++;
    totalRows += result.length;

    if (sampleArticles.length < 5) {
      sampleArticles.push({ pubmed_id: row.pubmed_id, affiliation: row.affiliation, rows: result });
    }
  }
  console.log("\nParsing og insert færdig.");

  // ── 3. Rapport ───────────────────────────────────────────────────────────
  console.log(`\n── Rapport ──`);
  console.log(`  Klasse C i alt:    ${rows.length}`);
  console.log(`  → Klasse B:        ${klasseB}`);
  console.log(`  → Fortsat C:       ${stillC}`);
  console.log(`  Total address-rows: ${totalRows}`);
  if (insertErrors) console.log(`  Insert-fejl:       ${insertErrors}`);

  // ── 4. Verifikation via DB ────────────────────────────────────────────────
  console.log("\n── DB-verifikation ──");

  const { data: v1 } = await db
    .from("geo_addresses_lab")
    .select("pubmed_id", { count: "exact", head: true });
  console.log(`  Rækker i geo_addresses_lab: (se aggregat nedenfor)`);

  // Aggregat
  const { data: allRows } = await db
    .from("geo_addresses_lab")
    .select("pubmed_id, country");

  if (allRows) {
    const byPubmed = new Map<string, number>();
    const countryCounts = new Map<string, number>();

    for (const r of allRows as Array<{ pubmed_id: string; country: string | null }>) {
      byPubmed.set(r.pubmed_id, (byPubmed.get(r.pubmed_id) ?? 0) + 1);
      const c = r.country ?? "(null)";
      countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1);
    }

    console.log(`  Artikler (distinct pubmed_id): ${byPubmed.size}`);
    console.log(`  Total rows:                    ${allRows.length}`);

    // Fordeling
    const dist = new Map<number, number>();
    for (const count of byPubmed.values()) {
      dist.set(count, (dist.get(count) ?? 0) + 1);
    }
    console.log("\n  Fordeling (rows per artikel):");
    for (const [n, art] of [...dist.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`    ${n} rows: ${art} artikler`);
    }

    // Top countries
    console.log("\n  Country-fordeling (top 10):");
    const sorted = [...countryCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [country, cnt] of sorted) {
      console.log(`    ${country.padEnd(30)} ${cnt}`);
    }
  }

  // ── 5. Sample-artikler ────────────────────────────────────────────────────
  console.log(`\n── Stikprøve (første ${sampleArticles.length} Klasse B-artikler) ──`);
  for (const art of sampleArticles) {
    console.log(`\n  PMID ${art.pubmed_id}`);
    console.log(`  Affiliation: ${art.affiliation.slice(0, 120)}${art.affiliation.length > 120 ? "…" : ""}`);
    for (const addr of art.rows!) {
      console.log(`\n    Position ${addr.position} (confidence: ${addr.confidence})`);
      if (addr.department)  console.log(`      dept:        ${addr.department}`);
      if (addr.institution) console.log(`      institution: ${addr.institution}`);
      if (addr.institution2) console.log(`      inst2:       ${addr.institution2}`);
      if (addr.city)        console.log(`      city:        ${addr.city}`);
      if (addr.country)     console.log(`      country:     ${addr.country}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
