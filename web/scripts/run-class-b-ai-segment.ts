/**
 * Kør Klasse B AI-prompt (article_geo_class_b, aktiv version) på AI-kandidat-artikler.
 *
 * Kandidat = mindst én row der matcher segment-kriterierne OG ikke er ai-processet endnu.
 * AI modtager alle rows for artiklen (ikke kun kandidat-rows) og korriger hele billedet.
 *
 * Springer PMID 31164008 over (konsortium-artikel med 121 rows → for lang til Haiku).
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/run-class-b-ai-segment.ts         # kør alle
 *   npx tsx scripts/run-class-b-ai-segment.ts 50      # maks 50 artikler
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
) as any;

const anthropic  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL      = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 4096;
const CONCURRENCY = 5;
const SKIP_PMID   = "31164008";

const articleLimit = parseInt(process.argv[2] ?? "99999", 10);

// ── Types ─────────────────────────────────────────────────────────────────────

interface DbRow {
  pubmed_id:              string;
  position:               number;
  city:                   string | null;
  state:                  string | null;
  country:                string | null;
  institution:            string | null;
  institution2:           string | null;
  institution3:           string | null;
  institutions_overflow:  string[];
  department:             string | null;
  department2:            string | null;
  department3:            string | null;
  departments_overflow:   string[];
  confidence:             string;
}

interface AiAddress {
  position:               number;
  department:             string | null;
  department2:            string | null;
  department3:            string | null;
  departments_overflow:   string[];
  institution:            string | null;
  institution2:           string | null;
  institution3:           string | null;
  institutions_overflow:  string[];
  city:                   string | null;
  state:                  string | null;
  country:                string | null;
  confidence:             "high" | "low";
  action:                 "kept" | "merged" | "new";
}

interface AiOutput {
  addresses: AiAddress[];
  changes:   string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildUserPrompt(affiliation: string, rows: DbRow[]): string {
  const parserRows = rows.map((r, i) => ({
    position:              i + 1,
    department:            r.department,
    department2:           r.department2,
    department3:           r.department3,
    departments_overflow:  r.departments_overflow,
    institution:           r.institution,
    institution2:          r.institution2,
    institution3:          r.institution3,
    institutions_overflow: r.institutions_overflow,
    city:                  r.city,
    state:                 r.state,
    country:               r.country,
    confidence:            r.confidence,
  }));
  return (
    `ORIGINAL AFFILIATION:\n${affiliation}\n\n` +
    `PARSER OUTPUT (${rows.length} adresse${rows.length !== 1 ? "r" : ""}):\n` +
    JSON.stringify(parserRows, null, 2) + "\n\n" +
    "Returnér korrigeret output som JSON."
  );
}

function parseJsonResponse(text: string): AiOutput {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = JSON.parse(stripped) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addresses: AiAddress[] = (obj.addresses ?? []).map((a: any, idx: number) => ({
    position:              typeof a.position === "number" ? a.position : idx + 1,
    department:            a.department            ?? null,
    department2:           a.department2           ?? null,
    department3:           a.department3           ?? null,
    departments_overflow:  Array.isArray(a.departments_overflow)  ? a.departments_overflow  : [],
    institution:           a.institution           ?? null,
    institution2:          a.institution2          ?? null,
    institution3:          a.institution3          ?? null,
    institutions_overflow: Array.isArray(a.institutions_overflow) ? a.institutions_overflow : [],
    city:                  a.city                  ?? null,
    state:                 a.state                 ?? null,
    country:               a.country               ?? null,
    confidence:            a.confidence === "low"  ? "low" : "high",
    action:                ["kept","merged","new"].includes(a.action) ? a.action : "kept",
  }));
  return {
    addresses,
    changes: Array.isArray(obj.changes) ? obj.changes : [],
  };
}

async function writeResults(
  pid: string,
  dbRows: DbRow[],
  output: AiOutput,
  now: string
): Promise<void> {
  const maxPos = Math.max(...dbRows.map((r) => r.position));

  for (let i = 0; i < output.addresses.length; i++) {
    const addr = output.addresses[i];
    if (i < dbRows.length) {
      await db.from("geo_addresses_lab").update({
        ai_country:               addr.country,
        ai_state:                 addr.state,
        ai_city:                  addr.city,
        ai_institution:           addr.institution,
        ai_institution2:          addr.institution2,
        ai_institution3:          addr.institution3,
        ai_institutions_overflow: addr.institutions_overflow,
        ai_department:            addr.department,
        ai_department2:           addr.department2,
        ai_department3:           addr.department3,
        ai_departments_overflow:  addr.departments_overflow,
        ai_confidence:            addr.confidence,
        ai_changes:               output.changes,
        ai_action:                addr.action,
        ai_processed_at:          now,
      }).eq("pubmed_id", pid).eq("position", dbRows[i].position);
    } else {
      const newPos = maxPos + (i - dbRows.length + 1);
      await db.from("geo_addresses_lab").insert({
        pubmed_id: pid, position: newPos,
        city: null, state: null, country: null,
        institution: null, institution2: null, institution3: null,
        institutions_overflow: [],
        department: null, department2: null, department3: null,
        departments_overflow: [], confidence: "low",
        ai_country: addr.country, ai_state: addr.state, ai_city: addr.city,
        ai_institution: addr.institution, ai_institution2: addr.institution2,
        ai_institution3: addr.institution3,
        ai_institutions_overflow: addr.institutions_overflow,
        ai_department: addr.department, ai_department2: addr.department2,
        ai_department3: addr.department3,
        ai_departments_overflow: addr.departments_overflow,
        ai_confidence: addr.confidence, ai_changes: output.changes,
        ai_action: "new", ai_processed_at: now,
      });
    }
  }
  // Mark dropped rows
  for (let i = output.addresses.length; i < dbRows.length; i++) {
    await db.from("geo_addresses_lab").update({
      ai_action: "dropped", ai_changes: output.changes, ai_processed_at: now,
    }).eq("pubmed_id", pid).eq("position", dbRows[i].position);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Hent aktiv prompt
  const { data: promptRow, error: promptErr } = await db
    .from("model_versions")
    .select("version, prompt_text")
    .eq("module", "article_geo_class_b")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (promptErr || !promptRow) throw new Error(`Ingen aktiv prompt: ${promptErr?.message ?? "no row"}`);
  console.log(`Prompt: article_geo_class_b ${promptRow.version}`);

  // 2. Hent kandidat-pubmed_ids via SQL
  const candidateSQL = `
    SELECT DISTINCT a.pubmed_id
    FROM geo_addresses_lab a
    JOIN geo_parser_b_run_1000 r ON r.pubmed_id = a.pubmed_id
    WHERE r.parser_status = 'parsed'
      AND a.ai_processed_at IS NULL
      AND a.pubmed_id != '${SKIP_PMID}'
      AND (
        a.confidence = 'low'
        OR a.city IS NULL
        OR (a.state IS NULL AND a.country IN (
          'United States','Canada','Australia','India','China','Japan','Brazil',
          'Germany','France','United Kingdom','Mexico','Italy','Spain','Russia',
          'South Korea','Nigeria','Egypt','South Africa','Indonesia','Pakistan'
        ))
        OR a.institution2 ~ '^\\d' OR a.institution3 ~ '^\\d'
        OR a.institution2 ~ '\\d{4,5}' OR a.institution3 ~ '\\d{4,5}'
        OR a.institution2 ~* '\\m(Street|Avenue|Road|Strasse|Walk|Hall|Piazza|rue|boul)\\M'
        OR a.institution3 ~* '\\m(Street|Avenue|Road|Strasse|Walk|Hall|Piazza|rue|boul)\\M'
        OR (a.city IS NOT NULL AND (a.institution2 = a.city OR a.institution3 = a.city))
        OR (a.state IS NOT NULL AND (a.institution2 = a.state OR a.institution3 = a.state))
        OR a.institution ~* '^(Department of|Division of|Service de|Servei de|Klinik|Abteilung)'
        OR cardinality(a.institutions_overflow) > 0
      )
    ORDER BY a.pubmed_id
    LIMIT ${articleLimit};
  `;

  const { data: candidates, error: candErr } = await db.rpc("execute_sql" as never, { query: candidateSQL });
  // Fallback: rpc might not exist — use direct query approach instead
  if (candErr) {
    // Use JS-side filtering: fetch all unprocessed, filter client-side
    console.log("  RPC ej tilgængeligt — bruger JS-side filtrering.");
    await runWithJsFiltering(promptRow.prompt_text as string);
    return;
  }

  const ids = (candidates as Array<{ pubmed_id: string }>).map((r) => r.pubmed_id);
  console.log(`Kandidater: ${ids.length} artikler (limit=${articleLimit})`);
  await runBatch(ids, promptRow.prompt_text as string);
}

async function runWithJsFiltering(promptText: string) {
  // Fetch all unprocessed rows + their affiliations
  const { data: allRows, error: rowsErr } = await db
    .from("geo_addresses_lab")
    .select("pubmed_id, position, confidence, city, state, country, institution, institution2, institution3, institutions_overflow, department, department2, department3, departments_overflow")
    .is("ai_processed_at", null)
    .neq("pubmed_id", SKIP_PMID);

  if (rowsErr || !allRows) throw new Error(rowsErr?.message ?? "no rows");

  // Group by pubmed_id
  const byArticle = new Map<string, typeof allRows>();
  for (const row of allRows) {
    if (!byArticle.has(row.pubmed_id)) byArticle.set(row.pubmed_id, []);
    byArticle.get(row.pubmed_id)!.push(row);
  }

  // Filter: at least one row matches candidate criteria
  const streetRe   = /\b(Street|Avenue|Road|Strasse|Walk|Hall|Piazza|rue|boul)\b/i;
  const highCountries = new Set([
    'United States','Canada','Australia','India','China','Japan','Brazil',
    'Germany','France','United Kingdom','Mexico','Italy','Spain','Russia',
    'South Korea','Nigeria','Egypt','South Africa','Indonesia','Pakistan',
  ]);
  const deptPrefixRe = /^(Department of|Division of|Service de|Servei de|Klinik|Abteilung)/i;

  const candidateIds: string[] = [];
  for (const [pid, rows] of byArticle) {
    const isCandidate = rows.some((r) =>
      r.confidence === "low" ||
      r.city === null ||
      (r.state === null && highCountries.has(r.country)) ||
      /^\d/.test(r.institution2 ?? "") || /^\d/.test(r.institution3 ?? "") ||
      /\d{4,5}/.test(r.institution2 ?? "") || /\d{4,5}/.test(r.institution3 ?? "") ||
      streetRe.test(r.institution2 ?? "") || streetRe.test(r.institution3 ?? "") ||
      (r.city && (r.institution2 === r.city || r.institution3 === r.city)) ||
      (r.state && (r.institution2 === r.state || r.institution3 === r.state)) ||
      deptPrefixRe.test(r.institution ?? "") ||
      (r.institutions_overflow?.length ?? 0) > 0
    );
    if (isCandidate) candidateIds.push(pid);
  }

  const ids = candidateIds.slice(0, articleLimit);
  console.log(`Kandidater: ${ids.length} artikler (JS-filtreret fra ${byArticle.size} uprocesserede)`);
  await runBatch(ids, promptText);
}

async function runBatch(ids: string[], promptText: string) {
  // Hent affiliations
  const { data: affiliations } = await db
    .from("geo_parser_b_run_1000")
    .select("pubmed_id, affiliation")
    .in("pubmed_id", ids);

  const affMap = new Map<string, string>(
    (affiliations ?? []).map((r: { pubmed_id: string; affiliation: string }) => [r.pubmed_id, r.affiliation])
  );

  let done = 0, succeeded = 0, failed = 0, jsonErrors = 0;
  let totalRowsBefore = 0, totalRowsAfter = 0, totalDropped = 0, totalNew = 0;
  const failedIds: string[] = [];

  const processOne = async (pid: string) => {
    const affiliation = affMap.get(pid) ?? "";

    // Hent alle rows for artiklen
    const { data: rows, error: rowErr } = await db
      .from("geo_addresses_lab")
      .select("*")
      .eq("pubmed_id", pid)
      .order("position", { ascending: true });

    if (rowErr || !rows || rows.length === 0) {
      failed++;
      failedIds.push(pid);
      return;
    }
    const dbRows = rows as DbRow[];
    totalRowsBefore += dbRows.length;

    let output: AiOutput;
    try {
      const msg = await anthropic.messages.create({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        system:     promptText,
        messages:   [{ role: "user", content: buildUserPrompt(affiliation, dbRows) }],
      });
      const rawText = (msg.content[0] as { type: string; text: string }).text.trim();
      output = parseJsonResponse(rawText);
    } catch (e) {
      const err = e as Error;
      if (err.message.includes("JSON") || err.message.includes("parse")) jsonErrors++;
      else failed++;
      failedIds.push(pid);
      return;
    }

    const now = new Date().toISOString();
    await writeResults(pid, dbRows, output, now);

    totalRowsAfter  += output.addresses.length;
    totalDropped    += Math.max(0, dbRows.length - output.addresses.length);
    totalNew        += Math.max(0, output.addresses.length - dbRows.length);
    succeeded++;
  };

  // Concurrent batches
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(processOne));
    done = Math.min(i + CONCURRENCY, ids.length);
    process.stdout.write(
      `\r  [${done}/${ids.length}]  ok=${succeeded}  fejl=${failed}  json-fejl=${jsonErrors}     `
    );
  }

  console.log("\n");

  // Markér SKIP_PMID med too_long
  await db.from("geo_addresses_lab")
    .update({ ai_action: "too_long", ai_processed_at: new Date().toISOString() })
    .eq("pubmed_id", SKIP_PMID)
    .is("ai_processed_at", null);

  // ── Rapport ───────────────────────────────────────────────────────────────
  console.log("── Denne kørsel ──");
  console.log(`  Artikler behandlet:   ${succeeded}`);
  console.log(`  Fejl:                 ${failed}`);
  console.log(`  JSON-fejl:            ${jsonErrors}`);
  console.log(`  Rows i alt (før):     ${totalRowsBefore}`);
  console.log(`  Rows i alt (efter):   ${totalRowsAfter}`);
  console.log(`  Nye rows (split):     ${totalNew}`);
  console.log(`  Droppede rows:        ${totalDropped}`);
  if (failedIds.length > 0) console.log(`  Fejl-IDs: ${failedIds.join(", ")}`);

  // ── Aggregat over alle processerede rows ──────────────────────────────────
  console.log("\n── Aggregat (alle ai-processerede rows) ──");
  const { data: agg } = await db
    .from("geo_addresses_lab")
    .select(
      "country, ai_country, state, ai_state, city, ai_city, confidence, ai_confidence, ai_action"
    )
    .not("ai_processed_at", "is", null)
    .neq("ai_action", "too_long");

  if (agg) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = agg as any[];
    const total           = rows.length;
    const lostCountry     = rows.filter((r) => r.country    && !r.ai_country).length;
    const lostState       = rows.filter((r) => r.state      && !r.ai_state).length;
    const lostCity        = rows.filter((r) => r.city       && !r.ai_city).length;
    const gainedCountry   = rows.filter((r) => !r.country   && r.ai_country).length;
    const gainedState     = rows.filter((r) => !r.state     && r.ai_state).length;
    const gainedCity      = rows.filter((r) => !r.city      && r.ai_city).length;
    const confUpgraded    = rows.filter((r) => r.confidence === "low" && r.ai_confidence === "high").length;
    const badCountryFmt   = rows.filter((r) => ["USA","UK","The Netherlands"].includes(r.ai_country)).length;
    const badStateFmt     = rows.filter((r) => r.ai_state && /^[A-Z]{2}$/.test(r.ai_state)).length;
    const dropped         = rows.filter((r) => r.ai_action === "dropped").length;
    const newRows         = rows.filter((r) => r.ai_action === "new").length;

    const articles = new Set(rows.map((r) => r.pubmed_id ?? "")).size;
    console.log(`  Unikke artikler:      ${articles}`);
    console.log(`  Total rows:           ${total}`);
    console.log(`  lost_country:         ${lostCountry}`);
    console.log(`  lost_state:           ${lostState}`);
    console.log(`  lost_city:            ${lostCity}`);
    console.log(`  gained_country:       ${gainedCountry}`);
    console.log(`  gained_state:         ${gainedState}`);
    console.log(`  gained_city:          ${gainedCity}`);
    console.log(`  conf_upgraded:        ${confUpgraded}`);
    console.log(`  bad_country_format:   ${badCountryFmt}`);
    console.log(`  bad_state_format:     ${badStateFmt}`);
    console.log(`  droppede:             ${dropped}`);
    console.log(`  nye (split):          ${newRows}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
