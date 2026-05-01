/**
 * Test Klasse A-prompt (article_geo_class_a) på de 54 Klasse B-artikler
 * parset i geo_parser_run_1000. Kalder Anthropic API direkte (synkront).
 * Skriver output til lab_b_ai_*-kolonner.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/test-class-b-ai.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1024;

// ── Types ─────────────────────────────────────────────────────────────────────

interface LabBRow {
  pubmed_id:                   string;
  affiliation:                 string | null;
  lab_b_department:            string | null;
  lab_b_department2:           string | null;
  lab_b_department3:           string | null;
  lab_b_departments_overflow:  string[] | null;
  lab_b_institution:           string | null;
  lab_b_institution2:          string | null;
  lab_b_institution3:          string | null;
  lab_b_institutions_overflow: string[] | null;
  lab_b_city:                  string | null;
  lab_b_state:                 string | null;
  lab_b_country:               string | null;
  lab_b_confidence:            string | null;
}

interface AiOutput {
  department:            string | null;
  department2:           string | null;
  department3:           string | null;
  departments_overflow:  string[];
  institution:           string | null;
  institution2:          string | null;
  institution3:          string | null;
  institutions_overflow: string[];
  city:                  string | null;
  state:                 string | null;
  country:               string | null;
  confidence:            "high" | "low";
  changes:               string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildUserPrompt(row: LabBRow): string {
  const parserOutput = {
    department:            row.lab_b_department,
    department2:           row.lab_b_department2,
    department3:           row.lab_b_department3,
    departments_overflow:  row.lab_b_departments_overflow ?? [],
    institution:           row.lab_b_institution,
    institution2:          row.lab_b_institution2,
    institution3:          row.lab_b_institution3,
    institutions_overflow: row.lab_b_institutions_overflow ?? [],
    city:                  row.lab_b_city,
    state:                 row.lab_b_state,
    country:               row.lab_b_country,
    confidence:            row.lab_b_confidence,
  };
  return (
    `ORIGINAL AFFILIATION:\n${row.affiliation ?? "(ingen)"}\n\n` +
    `PARSER OUTPUT:\n${JSON.stringify(parserOutput, null, 2)}\n\n` +
    `Returnér korrigeret output som JSON.`
  );
}

function parseJsonResponse(text: string): AiOutput {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const obj = JSON.parse(stripped);
  return {
    department:            obj.department            ?? null,
    department2:           obj.department2           ?? null,
    department3:           obj.department3           ?? null,
    departments_overflow:  Array.isArray(obj.departments_overflow)  ? obj.departments_overflow  : [],
    institution:           obj.institution           ?? null,
    institution2:          obj.institution2          ?? null,
    institution3:          obj.institution3          ?? null,
    institutions_overflow: Array.isArray(obj.institutions_overflow) ? obj.institutions_overflow : [],
    city:                  obj.city                  ?? null,
    state:                 obj.state                 ?? null,
    country:               obj.country               ?? null,
    confidence:            obj.confidence === "low"  ? "low" : "high",
    changes:               Array.isArray(obj.changes) ? obj.changes : [],
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Fetch active Klasse A prompt
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: promptRow, error: promptErr } = await (supabase as any)
    .from("model_versions")
    .select("version, prompt_text")
    .eq("module", "article_geo_class_a")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (promptErr || !promptRow) {
    throw new Error(`No active prompt: ${promptErr?.message ?? "no row"}`);
  }
  console.log(`Prompt: article_geo_class_a v${promptRow.version}`);

  // 2. Fetch all Klasse B rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("geo_parser_run_1000")
    .select(`
      pubmed_id, affiliation,
      lab_b_department, lab_b_department2, lab_b_department3, lab_b_departments_overflow,
      lab_b_institution, lab_b_institution2, lab_b_institution3, lab_b_institutions_overflow,
      lab_b_city, lab_b_state, lab_b_country, lab_b_confidence
    `)
    .eq("lab_b_class", "B");

  if (error || !data) throw new Error(error?.message ?? "no data");
  const rows = data as LabBRow[];
  console.log(`Hentet ${rows.length} Klasse B-artikler.\n`);

  // 3. Call AI for each row
  let succeeded = 0;
  let failed = 0;
  const failedIds: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    process.stdout.write(`\r  [${i + 1}/${rows.length}] ${row.pubmed_id}          `);

    let output: AiOutput;
    try {
      const msg = await anthropic.messages.create({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        system:     promptRow.prompt_text as string,
        messages:   [{ role: "user", content: buildUserPrompt(row) }],
      });
      const rawText = (msg.content[0] as { type: string; text: string }).text.trim();
      output = parseJsonResponse(rawText);
    } catch (e) {
      failed++;
      failedIds.push(row.pubmed_id);
      console.error(`\n  FEJL for ${row.pubmed_id}: ${(e as Error).message}`);
      continue;
    }

    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upErr } = await (supabase as any)
      .from("geo_parser_run_1000")
      .update({
        lab_b_ai_department:            output.department,
        lab_b_ai_department2:           output.department2,
        lab_b_ai_department3:           output.department3,
        lab_b_ai_departments_overflow:  output.departments_overflow,
        lab_b_ai_institution:           output.institution,
        lab_b_ai_institution2:          output.institution2,
        lab_b_ai_institution3:          output.institution3,
        lab_b_ai_institutions_overflow: output.institutions_overflow,
        lab_b_ai_city:                  output.city,
        lab_b_ai_state:                 output.state,
        lab_b_ai_country:               output.country,
        lab_b_ai_confidence:            output.confidence,
        lab_b_ai_changes:               output.changes,
        lab_b_ai_processed_at:          now,
      })
      .eq("pubmed_id", row.pubmed_id);

    if (upErr) {
      failed++;
      failedIds.push(row.pubmed_id);
      console.error(`\n  Write-fejl for ${row.pubmed_id}: ${upErr.message}`);
    } else {
      succeeded++;
    }
  }
  console.log(`\n\nFærdig. succeeded=${succeeded}, failed=${failed}`);
  if (failedIds.length > 0) console.log(`  Failed IDs: ${failedIds.join(", ")}`);

  // 4. Aggregat-rapport
  console.log("\n── Aggregat (SQL) ──");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: agg, error: aggErr } = await (supabase as any).rpc("run_sql" as never, {
    query: `
      SELECT
        COUNT(*)                                                                         AS total,
        COUNT(*) FILTER (WHERE array_length(lab_b_ai_changes, 1) > 0)                  AS made_changes,
        ROUND(AVG(array_length(lab_b_ai_changes, 1))::numeric, 2)                      AS avg_changes,
        COUNT(*) FILTER (WHERE lab_b_country IS NOT NULL AND lab_b_ai_country IS NULL)  AS lost_country,
        COUNT(*) FILTER (WHERE lab_b_ai_country IN ('USA','UK','The Netherlands'))      AS bad_country_format,
        COUNT(*) FILTER (WHERE lab_b_ai_state ~ '^[A-Z]{2}$')                          AS bad_state_format
      FROM geo_parser_run_1000
      WHERE lab_b_class = 'B'
    `,
  });

  // run_sql RPC may not exist — fall back to manual counts from data we already have
  if (aggErr || !agg) {
    console.log("  (run_sql RPC ikke tilgængeligt — beregner fra hukommelse)");
    // Re-fetch processed rows for local aggregation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: processed } = await (supabase as any)
      .from("geo_parser_run_1000")
      .select("lab_b_country, lab_b_ai_country, lab_b_ai_state, lab_b_ai_changes")
      .eq("lab_b_class", "B")
      .not("lab_b_ai_processed_at", "is", null);

    if (processed) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = processed as any[];
      const total        = p.length;
      const madeChanges  = p.filter((r) => Array.isArray(r.lab_b_ai_changes) && r.lab_b_ai_changes.length > 0).length;
      const avgChanges   = (p.reduce((s: number, r) => s + (Array.isArray(r.lab_b_ai_changes) ? r.lab_b_ai_changes.length : 0), 0) / (total || 1)).toFixed(2);
      const lostCountry  = p.filter((r) => r.lab_b_country && !r.lab_b_ai_country).length;
      const badCountry   = p.filter((r) => ["USA","UK","The Netherlands"].includes(r.lab_b_ai_country)).length;
      const badState     = p.filter((r) => r.lab_b_ai_state && /^[A-Z]{2}$/.test(r.lab_b_ai_state)).length;
      console.log(`  total:            ${total}`);
      console.log(`  made_changes:     ${madeChanges}`);
      console.log(`  avg_changes:      ${avgChanges}`);
      console.log(`  lost_country:     ${lostCountry}`);
      console.log(`  bad_country_fmt:  ${badCountry}`);
      console.log(`  bad_state_fmt:    ${badState}`);
    }
  } else {
    console.log(JSON.stringify(agg, null, 2));
  }

  // 5. Stikprøve af de 3 problematiske
  const SPOT_IDS = ["40043784", "35772608", "41967785"];
  console.log(`\n── Stikprøve: ${SPOT_IDS.join(", ")} ──`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: spot, error: spotErr } = await (supabase as any)
    .from("geo_parser_run_1000")
    .select(`
      pubmed_id, affiliation,
      lab_b_institution, lab_b_institution2, lab_b_institution3, lab_b_institutions_overflow,
      lab_b_ai_institution, lab_b_ai_institution2, lab_b_ai_institution3, lab_b_ai_institutions_overflow,
      lab_b_ai_changes
    `)
    .in("pubmed_id", SPOT_IDS);

  if (spotErr || !spot) {
    console.error("  Spot-query fejl:", spotErr?.message);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of spot as any[]) {
      console.log(`\n  PMID ${r.pubmed_id}`);
      console.log(`  affiliation: ${(r.affiliation ?? "").slice(0, 120)}…`);
      console.log(`  PARSER  inst1: ${r.lab_b_institution}`);
      console.log(`          inst2: ${r.lab_b_institution2}`);
      console.log(`          inst3: ${r.lab_b_institution3}`);
      console.log(`          overflow: ${JSON.stringify(r.lab_b_institutions_overflow)}`);
      console.log(`  AI      inst1: ${r.lab_b_ai_institution}`);
      console.log(`          inst2: ${r.lab_b_ai_institution2}`);
      console.log(`          inst3: ${r.lab_b_ai_institution3}`);
      console.log(`          overflow: ${JSON.stringify(r.lab_b_ai_institutions_overflow)}`);
      console.log(`  changes: ${JSON.stringify(r.lab_b_ai_changes)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
