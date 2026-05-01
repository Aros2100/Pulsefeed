/**
 * Kør Klasse B-parseren mod alle Klasse C-artikler i geo_parser_run_1000
 * og skriv resultater til lab_b_*-kolonner.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/test-class-b.ts
 *
 * Forventning: ~52 ud af 71 Klasse C-artikler reklassificeres som Klasse B.
 */

import { createClient } from "@supabase/supabase-js";
import { parseClassB } from "../src/admin/lab/geo-validation/parser-class-b/affiliation-parser-b";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BATCH_SIZE = 50;

async function main() {
  // ── Trin 1: Hent alle Klasse C-artikler med affiliation ──────────────────
  console.log("Henter Klasse C-artikler fra geo_parser_run_1000...");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("geo_parser_run_1000")
    .select("pubmed_id, affiliation")
    .eq("lab_class", "C")
    .not("affiliation", "is", null);

  if (error || !data) throw new Error(error?.message ?? "no data");

  const rows = data as Array<{ pubmed_id: string; affiliation: string }>;
  console.log(`Hentet ${rows.length} Klasse C-artikler.`);

  // ── Trin 2: Parse og byg update-payload ──────────────────────────────────
  type UpdateRow = {
    pubmed_id:                  string;
    lab_b_class:                "B" | null;
    lab_b_department:           string | null;
    lab_b_department2:          string | null;
    lab_b_department3:          string | null;
    lab_b_departments_overflow: string[];
    lab_b_institution:          string | null;
    lab_b_institution2:         string | null;
    lab_b_institution3:         string | null;
    lab_b_institutions_overflow: string[];
    lab_b_city:                 string | null;
    lab_b_state:                string | null;
    lab_b_country:              string | null;
    lab_b_confidence:           string | null;
    lab_b_num_addresses:        number | null;
  };

  const updates: UpdateRow[] = [];
  let klasseB = 0;
  let stillC = 0;
  let errors = 0;

  console.log("Klasse B-parser kører...");
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const result = await parseClassB(row.affiliation);
      if (result !== null) {
        klasseB++;
        updates.push({
          pubmed_id:                   row.pubmed_id,
          lab_b_class:                 "B",
          lab_b_department:            result.department,
          lab_b_department2:           result.department2,
          lab_b_department3:           result.department3,
          lab_b_departments_overflow:  result.departments_overflow,
          lab_b_institution:           result.institution,
          lab_b_institution2:          result.institution2,
          lab_b_institution3:          result.institution3,
          lab_b_institutions_overflow: result.institutions_overflow,
          lab_b_city:                  result.city,
          lab_b_state:                 result.state,
          lab_b_country:               result.country,
          lab_b_confidence:            result.confidence,
          lab_b_num_addresses:          result.parts_parsed,
        });
      } else {
        stillC++;
        updates.push({
          pubmed_id:                   row.pubmed_id,
          lab_b_class:                 null,
          lab_b_department:            null,
          lab_b_department2:           null,
          lab_b_department3:           null,
          lab_b_departments_overflow:  [],
          lab_b_institution:           null,
          lab_b_institution2:          null,
          lab_b_institution3:          null,
          lab_b_institutions_overflow: [],
          lab_b_city:                  null,
          lab_b_state:                 null,
          lab_b_country:               null,
          lab_b_confidence:            null,
          lab_b_num_addresses:          null,
        });
      }
    } catch (err) {
      errors++;
      console.error(`\nFejl ved ${row.pubmed_id}: ${err}`);
      updates.push({
        pubmed_id:                   row.pubmed_id,
        lab_b_class:                 null,
        lab_b_department:            null,
        lab_b_department2:           null,
        lab_b_department3:           null,
        lab_b_departments_overflow:  [],
        lab_b_institution:           null,
        lab_b_institution2:          null,
        lab_b_institution3:          null,
        lab_b_institutions_overflow: [],
        lab_b_city:                  null,
        lab_b_state:                 null,
        lab_b_country:               null,
        lab_b_confidence:            null,
        lab_b_num_addresses:          null,
      });
    }

    if ((i + 1) % 10 === 0 || i === rows.length - 1) {
      process.stdout.write(
        `\r  Parsede: ${i + 1}/${rows.length}  (B=${klasseB}, C=${stillC}${errors ? `, err=${errors}` : ""})`
      );
    }
  }
  console.log("\nParsing færdig.");

  // ── Trin 3: Diagnose — skriv første række separat med fuld fejl-logning ──
  console.log("\n── Diagnose: skriver første række direkte ──");
  {
    const first = updates[0];
    if (first) {
      const { pubmed_id, ...fields } = first;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: dData, error: dErr, status, statusText } = await (supabase as any)
        .from("geo_parser_run_1000")
        .update(fields)
        .eq("pubmed_id", pubmed_id)
        .select("pubmed_id");
      console.log(`  pubmed_id: ${pubmed_id}`);
      console.log(`  status: ${status} ${statusText}`);
      if (dErr) {
        console.error(`  FEJL: ${dErr.message}`);
        console.error(`  code: ${dErr.code}`);
        console.error(`  details: ${dErr.details}`);
        console.error(`  hint: ${dErr.hint}`);
      } else {
        console.log(`  OK — rækker opdateret: ${JSON.stringify(dData)}`);
      }
    }
  }

  // ── Trin 4: Batch-UPDATE til Supabase ────────────────────────────────────
  console.log(`\nSkriver ${updates.length} rækker til geo_parser_run_1000 (batch=${BATCH_SIZE})...`);

  let written = 0;
  let writeErrors = 0;
  let firstErrorLogged = false;

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(({ pubmed_id, ...fields }) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("geo_parser_run_1000")
          .update(fields)
          .eq("pubmed_id", pubmed_id)
      )
    );

    for (const { error: upErr } of results) {
      if (upErr) {
        writeErrors++;
        if (!firstErrorLogged || writeErrors <= 5) {
          firstErrorLogged = true;
          console.error(`\nUpdate-fejl [${writeErrors}]: ${upErr.message} | code=${upErr.code} | details=${upErr.details} | hint=${upErr.hint}`);
        }
      } else {
        written++;
      }
    }

    if ((i + BATCH_SIZE) % 100 === 0 || i + BATCH_SIZE >= updates.length) {
      process.stdout.write(
        `\r  Skrevet: ${written}/${updates.length}${writeErrors ? `, fejl=${writeErrors}` : ""}`
      );
    }
  }
  console.log("\nWrite færdig.");

  // ── Trin 4: Rapport ───────────────────────────────────────────────────────
  console.log(`\n── Rapport ──`);
  console.log(`  Klasse C i alt:  ${rows.length}`);
  console.log(`  → Klasse B:      ${klasseB}`);
  console.log(`  → Fortsat C:     ${stillC}`);
  if (errors) console.log(`  Parse-fejl:      ${errors}`);
  if (writeErrors) console.log(`  Write-fejl:      ${writeErrors}`);

  // ── Trin 5: Spot-tjek et par Klasse B-resultater ─────────────────────────
  const klassBUpdates = updates.filter((u) => u.lab_b_class === "B").slice(0, 3);
  if (klassBUpdates.length > 0) {
    console.log(`\n── Stikprøve (første ${klassBUpdates.length} Klasse B) ──`);
    for (const u of klassBUpdates) {
      console.log(`\n  pubmed_id: ${u.pubmed_id}`);
      console.log(`  country:     ${u.lab_b_country}`);
      console.log(`  institution: ${u.lab_b_institution}`);
      if (u.lab_b_institution2) console.log(`  inst2:       ${u.lab_b_institution2}`);
      console.log(`  department:  ${u.lab_b_department}`);
      console.log(`  city:        ${u.lab_b_city}`);
      console.log(`  confidence:  ${u.lab_b_confidence}  (${u.lab_b_parts_parsed} dele)`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
