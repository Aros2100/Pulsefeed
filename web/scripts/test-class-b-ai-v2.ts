/**
 * Test Klasse B AI-prompt (article_geo_class_b v1.0) på geo_addresses_lab.
 *
 * AI modtager hele original-streng + alle parser-rows for en artikel og kan
 * ændre antal rows (slå sammen, tilføje, droppe).
 * Skriver ai_*-felter tilbage til geo_addresses_lab.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/test-class-b-ai-v2.ts          # 5 random artikler
 *   npx tsx scripts/test-class-b-ai-v2.ts 10       # 10 artikler
 *   npx tsx scripts/test-class-b-ai-v2.ts 0 40712178,41072038  # specifikke PMIDs
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
) as any;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL      = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 2048;

const sampleSize   = parseInt(process.argv[2] ?? "5", 10) || 5;
const specificIds  = process.argv[3] ? process.argv[3].split(",").map((s) => s.trim()) : null;

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
    `${JSON.stringify(parserRows, null, 2)}\n\n` +
    `Returnér korrigeret output som JSON.`
  );
}

function parseJsonResponse(text: string): AiOutput {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/,            "")
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

function label(v: string | null): string { return v ?? "(null)"; }

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Hent aktiv Klasse B-prompt
  const { data: promptRow, error: promptErr } = await db
    .from("model_versions")
    .select("version, prompt_text")
    .eq("module", "article_geo_class_b")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (promptErr || !promptRow) {
    throw new Error(`Ingen aktiv prompt: ${promptErr?.message ?? "no row"}`);
  }
  console.log(`Prompt: article_geo_class_b ${promptRow.version}`);

  // 2. Hent alle parsede artikler
  const { data: allArticles, error: artErr } = await db
    .from("geo_parser_b_run_1000")
    .select("pubmed_id, affiliation")
    .eq("parser_status", "parsed");

  if (artErr || !allArticles) throw new Error(artErr?.message ?? "no articles");
  const all = allArticles as Array<{ pubmed_id: string; affiliation: string }>;

  // Hent allerede-processerede pubmed_ids (ai_processed_at IS NOT NULL)
  const { data: processedRows } = await db
    .from("geo_addresses_lab")
    .select("pubmed_id")
    .not("ai_processed_at", "is", null);
  const processedIdSet = new Set(
    (processedRows ?? []).map((r: { pubmed_id: string }) => r.pubmed_id)
  );

  // Byg kandidatliste og vælg sample
  let articles: typeof all;
  if (specificIds) {
    // Specifikke PMIDs: kør uanset om de er processerede
    articles = all.filter((a) => specificIds.includes(a.pubmed_id));
  } else {
    // Random: filtrer processerede fra, shuffle, tag N
    const unprocessed = all.filter((a) => !processedIdSet.has(a.pubmed_id));
    for (let i = unprocessed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unprocessed[i], unprocessed[j]] = [unprocessed[j], unprocessed[i]];
    }
    articles = unprocessed.slice(0, sampleSize);
    console.log(
      `Tilgængelige (uprocesserede): ${unprocessed.length} / ${all.length} — tager ${articles.length}.`
    );
  }

  console.log(`Tester ${articles.length} artikler.\n`);

  let succeeded = 0;
  let failed    = 0;
  let totalRowsBefore = 0;
  let totalRowsAfter  = 0;
  let totalDropped    = 0;
  let totalNew        = 0;

  // 3. Behandl én artikel ad gangen
  for (const article of articles as Array<{ pubmed_id: string; affiliation: string }>) {
    const pid = article.pubmed_id;
    console.log(`${"═".repeat(72)}`);
    console.log(`PMID ${pid}`);
    console.log(`STRENG: ${article.affiliation}`);

    // Hent alle eksisterende rows sorteret på position
    const { data: rows, error: rowErr } = await db
      .from("geo_addresses_lab")
      .select("*")
      .eq("pubmed_id", pid)
      .order("position", { ascending: true });

    if (rowErr || !rows || (rows as DbRow[]).length === 0) {
      console.log("  Ingen rows — springer over.\n");
      continue;
    }
    const dbRows = rows as DbRow[];
    totalRowsBefore += dbRows.length;

    console.log(`\nPARSER (${dbRows.length} rows):`);
    for (const r of dbRows) {
      console.log(
        `  [${r.position}] city=${label(r.city)} state=${label(r.state)} ` +
        `country=${label(r.country)} conf=${r.confidence}`
      );
      console.log(`       dept=${label(r.department)}  inst=${label(r.institution)}`);
      if (r.institution2) console.log(`       inst2=${r.institution2}`);
    }

    // 4. Kald AI
    let output: AiOutput;
    try {
      const msg = await anthropic.messages.create({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        system:     promptRow.prompt_text as string,
        messages:   [{ role: "user", content: buildUserPrompt(article.affiliation, dbRows) }],
      });
      const rawText = (msg.content[0] as { type: string; text: string }).text.trim();
      output = parseJsonResponse(rawText);
    } catch (e) {
      console.error(`  AI-FEJL: ${(e as Error).message}\n`);
      failed++;
      continue;
    }

    console.log(`\nAI (${output.addresses.length} rows):`);
    for (const a of output.addresses) {
      console.log(
        `  [${a.position}] action=${a.action} city=${label(a.city)} state=${label(a.state)} ` +
        `country=${label(a.country)} conf=${a.confidence}`
      );
      console.log(`       dept=${label(a.department)}  inst=${label(a.institution)}`);
      if (a.institution2) console.log(`       inst2=${a.institution2}`);
    }
    if (output.changes.length > 0) {
      console.log(`  changes: ${output.changes.join("; ")}`);
    } else {
      console.log("  changes: (ingen)");
    }

    // 5. Reconciler og skriv til DB
    // Match ved array-index: AI[i] → dbRows[i] (sorteret på position)
    // Hvis AI har færre rows: resterende DB-rows markeres dropped
    // Hvis AI har flere rows: nye indsættes med nye positioner

    const now = new Date().toISOString();
    const maxExistingPos = Math.max(...dbRows.map((r) => r.position));

    for (let i = 0; i < output.addresses.length; i++) {
      const addr = output.addresses[i];

      if (i < dbRows.length) {
        // Opdater eksisterende row
        const { error: upErr } = await db
          .from("geo_addresses_lab")
          .update({
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
          })
          .eq("pubmed_id", pid)
          .eq("position", dbRows[i].position);

        if (upErr) console.error(`  DB UPDATE FEJL pos=${dbRows[i].position}: ${upErr.message}`);
      } else {
        // Indsæt ny row (split/new fra AI)
        const newPos = maxExistingPos + (i - dbRows.length + 1);
        const { error: insErr } = await db
          .from("geo_addresses_lab")
          .insert({
            pubmed_id:                pid,
            position:                 newPos,
            city:                     null,
            state:                    null,
            country:                  null,
            institution:              null,
            institution2:             null,
            institution3:             null,
            institutions_overflow:    [],
            department:               null,
            department2:              null,
            department3:              null,
            departments_overflow:     [],
            confidence:               "low",
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
            ai_action:                "new",
            ai_processed_at:          now,
          });

        if (insErr) console.error(`  DB INSERT FEJL newPos=${newPos}: ${insErr.message}`);
        else totalNew++;
      }
    }

    // Marker overskydende DB-rows som dropped
    for (let i = output.addresses.length; i < dbRows.length; i++) {
      const { error: dropErr } = await db
        .from("geo_addresses_lab")
        .update({
          ai_action:       "dropped",
          ai_changes:      output.changes,
          ai_processed_at: now,
        })
        .eq("pubmed_id", pid)
        .eq("position", dbRows[i].position);

      if (dropErr) console.error(`  DB DROP FEJL pos=${dbRows[i].position}: ${dropErr.message}`);
      else totalDropped++;
    }

    totalRowsAfter += output.addresses.length;
    succeeded++;
    console.log(`  → Skrevet til DB.\n`);
  }

  // 6. Aggregat-rapport
  console.log(`${"═".repeat(72)}`);
  console.log(`SAMLET RAPPORT`);
  console.log(`  Artikler behandlet: ${succeeded} / ${articles.length}`);
  console.log(`  Fejl:               ${failed}`);
  console.log(`  Parser-rows i alt:  ${totalRowsBefore}`);
  console.log(`  AI-rows i alt:      ${totalRowsAfter}`);
  console.log(`  Nye rows (split):   ${totalNew}`);
  console.log(`  Droppede rows:      ${totalDropped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
