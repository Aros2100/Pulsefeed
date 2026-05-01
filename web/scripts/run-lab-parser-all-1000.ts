/**
 * Kør lab-parseren mod alle 1000 artikler i geo_parser_run_1000
 * og skriv resultater til lab_*-kolonner.
 */

import { createClient } from "@supabase/supabase-js";
import { parseAffiliation } from "../src/admin/lab/geo-validation/parser/affiliation-parser";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BATCH_SIZE = 50;

async function main() {
  // ── Trin 1: Hent alle artikler med affiliation ────────────────────────────
  console.log("Henter artikler fra geo_parser_run_1000...");

  const { data, error } = await supabase
    .from("geo_parser_run_1000")
    .select("pubmed_id, affiliation")
    .not("affiliation", "is", null)
    .order("pubmed_id", { ascending: true });

  if (error || !data) throw new Error(error?.message ?? "no data");
  console.log(`Hentet ${data.length} artikler.`);

  // ── Trin 2: Parse og byg update-payload ──────────────────────────────────
  type UpdateRow = {
    pubmed_id: string;
    lab_class: "A" | "C";
    lab_department: string | null;
    lab_department2: string | null;
    lab_department3: string | null;
    lab_departments_overflow: string[];
    lab_institution: string | null;
    lab_institution2: string | null;
    lab_institution3: string | null;
    lab_institutions_overflow: string[];
    lab_city: string | null;
    lab_state: string | null;
    lab_country: string | null;
    lab_confidence: string | null;
  };

  const rows = data as Array<{ pubmed_id: string; affiliation: string }>;
  const updates: UpdateRow[] = [];
  let klasseA = 0;
  let klasseC = 0;
  let errors = 0;

  console.log("Parser kører...");
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const result = await parseAffiliation(row.affiliation);
      if (result === null) {
        klasseC++;
        updates.push({
          pubmed_id: row.pubmed_id,
          lab_class: "C",
          lab_department: null,
          lab_department2: null,
          lab_department3: null,
          lab_departments_overflow: [],
          lab_institution: null,
          lab_institution2: null,
          lab_institution3: null,
          lab_institutions_overflow: [],
          lab_city: null,
          lab_state: null,
          lab_country: null,
          lab_confidence: null,
        });
      } else {
        klasseA++;
        updates.push({
          pubmed_id: row.pubmed_id,
          lab_class: "A",
          lab_department: result.department,
          lab_department2: result.department2,
          lab_department3: result.department3,
          lab_departments_overflow: result.departments_overflow,
          lab_institution: result.institution,
          lab_institution2: result.institution2,
          lab_institution3: result.institution3,
          lab_institutions_overflow: result.institutions_overflow,
          lab_city: result.city,
          lab_state: result.state,
          lab_country: result.country,
          lab_confidence: result.confidence,
        });
      }
    } catch (err) {
      errors++;
      console.error(`\nFejl ved ${row.pubmed_id}: ${err}`);
      // Skriv som C ved parse-fejl
      updates.push({
        pubmed_id: row.pubmed_id,
        lab_class: "C",
        lab_department: null,
        lab_department2: null,
        lab_department3: null,
        lab_departments_overflow: [],
        lab_institution: null,
        lab_institution2: null,
        lab_institution3: null,
        lab_institutions_overflow: [],
        lab_city: null,
        lab_state: null,
        lab_country: null,
        lab_confidence: null,
      });
    }

    if ((i + 1) % 50 === 0 || i === rows.length - 1) {
      process.stdout.write(`\r  Parsede: ${i + 1}/${rows.length}  (A=${klasseA}, C=${klasseC}${errors ? `, err=${errors}` : ""})`);
    }
  }
  console.log("\nParsing færdig.");

  // ── Trin 3: Batch-UPDATE til Supabase (parallel inden for batch) ─────────
  // pubmed_id har ikke unique constraint → upsert virker ikke.
  // Kør BATCH_SIZE samtidige .update().eq() i stedet.
  console.log(`\nSkriver ${updates.length} rækker til geo_parser_run_1000 (parallel batch=${BATCH_SIZE})...`);

  let written = 0;
  let writeErrors = 0;

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(({ pubmed_id, ...fields }) =>
        supabase
          .from("geo_parser_run_1000")
          .update(fields)
          .eq("pubmed_id", pubmed_id)
      )
    );

    for (const { error: upErr } of results) {
      if (upErr) {
        writeErrors++;
        console.error(`\nUpdate-fejl: ${upErr.message}`);
      } else {
        written++;
      }
    }

    if ((i + BATCH_SIZE) % 200 === 0 || i + BATCH_SIZE >= updates.length) {
      process.stdout.write(`\r  Skrevet: ${written}/${updates.length}${writeErrors ? `, fejl=${writeErrors}` : ""}`);
    }
  }
  console.log("\nWrite færdig.");

  // ── Trin 4: Verificér ─────────────────────────────────────────────────────
  console.log("\nVerificerer...");
  const { data: verify, error: vErr } = await supabase.rpc("verify_lab_parse_run" as never);

  // Kør manuelt hvis RPC ikke findes
  const { data: counts, error: cErr } = await (supabase as any)
    .from("geo_parser_run_1000")
    .select("lab_class")
    .not("affiliation", "is", null);

  if (!cErr && counts) {
    const total = counts.length;
    const a = counts.filter((r: any) => r.lab_class === "A").length;
    const c = counts.filter((r: any) => r.lab_class === "C").length;
    const missing = counts.filter((r: any) => r.lab_class === null).length;
    console.log(`\n── Verificering ──`);
    console.log(`  total:    ${total}`);
    console.log(`  klasse_A: ${a}`);
    console.log(`  klasse_C: ${c}`);
    console.log(`  missing:  ${missing}`);
    console.log(`  ${missing === 0 ? "✓ Ingen missing" : "✗ ADVARSEL: " + missing + " rækker mangler lab_class"}`);
  }

  console.log(`\n── Rapport ──`);
  console.log(`  Parsede i alt:  ${rows.length}`);
  console.log(`  Klasse A:       ${klasseA}`);
  console.log(`  Klasse C:       ${klasseC}`);
  if (errors) console.log(`  Parse-fejl:     ${errors}`);
  if (writeErrors) console.log(`  Write-fejl:     ${writeErrors}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
