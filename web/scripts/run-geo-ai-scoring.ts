/**
 * run-geo-ai-scoring.ts
 *
 * Scores the 154 articles in geo_parser_run_1000 where ai_needed != 'none'
 * using Claude Haiku. Fills in the ai_* columns for each field listed in
 * ai_fields. Idempotent: skips already-scored rows (ai_scored_at IS NOT NULL).
 *
 * Usage:
 *   npx tsx scripts/run-geo-ai-scoring.ts [--dry-run] [--concurrency 3]
 *
 * Options:
 *   --dry-run       Print prompts + mock responses, no DB writes, no AI calls
 *   --concurrency N Set concurrency (default: 3)
 */

import { config } from "dotenv";
config({ path: new URL("../.env.local", import.meta.url).pathname });

import Anthropic from "@anthropic-ai/sdk";
import pLimit from "p-limit";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Config ────────────────────────────────────────────────────────────────────

const MODEL          = "claude-haiku-4-5-20251001";
const MAX_TOKENS     = 256;
const HARD_STOP_AFTER = 5;   // consecutive failures before aborting

const args        = process.argv.slice(2);
const DRY_RUN     = args.includes("--dry-run");
const concIdx     = args.indexOf("--concurrency");
const CONCURRENCY = concIdx !== -1 ? parseInt(args[concIdx + 1] ?? "3", 10) : 3;

// ── Types ─────────────────────────────────────────────────────────────────────

type GeoField = "country" | "city" | "state" | "institution" | "department";

type SnapshotRow = {
  id:                   string;
  pubmed_id:            string | null;
  affiliation:          string | null;
  after_city:           string | null;
  after_state:          string | null;
  after_country:        string | null;
  after_institution:    string | null;
  after_department:     string | null;
  enriched_state:       string | null;
  ai_fields:            GeoField[] | null;
  ai_needed:            string;
};

// ── Prompt builder ────────────────────────────────────────────────────────────

function val(v: string | null): string {
  return v && v.trim() ? v.trim() : "(not extracted)";
}

function buildPrompt(row: SnapshotRow): string {
  const parserState = row.enriched_state ?? row.after_state;
  const fields      = row.ai_fields ?? [];

  return `You are extracting geographic and institutional information from an academic affiliation string. The affiliation string is the only source of truth.

RULES:
1. The affiliation string is the ONLY source of truth. Do not use external knowledge or assumptions about institutions, cities, or geography.
2. Do not infer values that are not explicitly stated in the string.
3. If the string does not unambiguously support a value, return an empty string ("") for that field. When in doubt, return empty.
4. The "known values" below have already been extracted by an upstream parser and are treated as correct. Use them as context to locate the requested fields. Do not return or modify them.
5. Return ONLY the fields listed under "FIELDS TO EXTRACT" — no other fields.
6. Return strict JSON with exactly the requested keys. No prose, no explanation, no markdown fences.

EXAMPLES:

Example 1 — string supports the value:
AFFILIATION: "Department of Neurosurgery, Johns Hopkins University, Baltimore, Maryland, USA"
KNOWN VALUES: country=USA, city=Baltimore, state=Maryland, department=Department of Neurosurgery
FIELDS TO EXTRACT: ["institution"]
OUTPUT: {"institution": "Johns Hopkins University"}

Example 2 — string does NOT support the value (return empty):
AFFILIATION: "Department of Surgery, Berlin, Germany"
KNOWN VALUES: country=Germany, city=Berlin, department=Department of Surgery
FIELDS TO EXTRACT: ["institution"]
OUTPUT: {"institution": ""}

Reasoning for Example 2: The string mentions a city and country but no specific institution name. Returning an institution would be a guess. Return empty.

---

NOW EXTRACT FOR THIS AFFILIATION:

AFFILIATION:
${row.affiliation ?? "(no affiliation)"}

KNOWN VALUES:
- country: ${val(row.after_country)}
- city: ${val(row.after_city)}
- state: ${val(parserState)}
- institution: ${val(row.after_institution)}
- department: ${val(row.after_department)}

FIELDS TO EXTRACT:
${JSON.stringify(fields)}

OUTPUT:`;
}

// ── Response parser ───────────────────────────────────────────────────────────

function parseResponse(
  rawText: string,
  requestedFields: GeoField[]
): { values: Record<GeoField, string>; warnings: string[] } {
  const warnings: string[] = [];
  const values = {} as Record<GeoField, string>;

  // Strip markdown fences if model ignores instructions
  const stripped = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new Error(`JSON parse failed. Raw: ${rawText.slice(0, 200)}`);
  }

  for (const f of requestedFields) {
    if (!(f in parsed)) {
      warnings.push(`Missing requested field "${f}" in response`);
      values[f] = "";
    } else {
      const v = parsed[f];
      if (typeof v !== "string") {
        warnings.push(`Field "${f}" is not a string (got ${typeof v}), coercing`);
        values[f] = String(v ?? "");
      } else {
        values[f] = v;
      }
    }
  }

  // Warn about extra keys
  for (const k of Object.keys(parsed)) {
    if (!requestedFields.includes(k as GeoField)) {
      warnings.push(`Extra key "${k}" in response (ignored)`);
    }
  }

  return { values, warnings };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n[geo-ai-scoring] Starting${DRY_RUN ? " (DRY RUN)" : ""}`);
  console.log(`  model:       ${MODEL}`);
  console.log(`  concurrency: ${CONCURRENCY}`);
  console.log(`  hard-stop:   ${HARD_STOP_AFTER} consecutive failures\n`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin     = createAdminClient() as any;
  const anthropic = new Anthropic();
  const startedAt = Date.now();

  // Fetch all unscored rows
  const { data, error } = await admin
    .from("geo_parser_run_1000")
    .select("id, pubmed_id, affiliation, after_city, after_state, after_country, after_institution, after_department, enriched_state, ai_fields, ai_needed")
    .neq("ai_needed", "none")
    .is("ai_scored_at", null)
    .order("pubmed_id");

  if (error) {
    console.error("[geo-ai-scoring] Failed to fetch rows:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as SnapshotRow[];
  console.log(`[geo-ai-scoring] ${rows.length} rows to score\n`);

  if (rows.length === 0) {
    console.log("[geo-ai-scoring] Nothing to do.");
    return;
  }

  // Stats
  let successCount      = 0;
  let errorCount        = 0;
  let consecutiveFails  = 0;
  let totalInputTokens  = 0;
  let totalOutputTokens = 0;
  const bucketStats: Record<string, { success: number; error: number }> = {};
  const allErrors: { pubmed_id: string | null; error: string }[] = [];

  const limiter = pLimit(CONCURRENCY);

  await Promise.all(
    rows.map((row) =>
      limiter(async () => {
        const bucket = row.ai_needed;
        if (!bucketStats[bucket]) bucketStats[bucket] = { success: 0, error: 0 };

        if (consecutiveFails >= HARD_STOP_AFTER) return; // hard-stop gate

        const fields = (row.ai_fields ?? []) as GeoField[];
        if (fields.length === 0) {
          console.warn(`[geo-ai-scoring] ${row.pubmed_id}: ai_fields is empty — skipping`);
          return;
        }

        const prompt = buildPrompt(row);

        if (DRY_RUN) {
          console.log(`[DRY RUN] ${row.pubmed_id} (${bucket}) — fields: ${JSON.stringify(fields)}`);
          console.log(`  Prompt length: ${prompt.length} chars`);
          return;
        }

        let aiRawResponse: Record<string, unknown> | null = null;
        let aiError: string | null                        = null;

        try {
          const response = await anthropic.messages.create({
            model:      MODEL,
            max_tokens: MAX_TOKENS,
            messages:   [{ role: "user", content: prompt }],
          });

          totalInputTokens  += response.usage.input_tokens;
          totalOutputTokens += response.usage.output_tokens;

          const rawText = response.content
            .filter((b) => b.type === "text")
            .map((b) => (b as { type: "text"; text: string }).text)
            .join("");

          aiRawResponse = {
            model:      response.model,
            usage:      response.usage,
            raw_text:   rawText,
          };

          const { values, warnings } = parseResponse(rawText, fields);

          if (warnings.length > 0) {
            console.warn(`[geo-ai-scoring] ${row.pubmed_id} warnings: ${warnings.join("; ")}`);
          }

          // Build update payload — only write ai_* columns for fields in ai_fields
          const updatePayload: Record<string, unknown> = {
            ai_scored_at:    new Date().toISOString(),
            ai_model:        MODEL,
            ai_raw_response: aiRawResponse,
            ai_error:        null,
          };
          for (const f of fields) {
            updatePayload[`ai_${f}`] = values[f];
          }

          const { error: updateError } = await admin
            .from("geo_parser_run_1000")
            .update(updatePayload)
            .eq("id", row.id);

          if (updateError) throw new Error(`DB update failed: ${updateError.message}`);

          successCount++;
          bucketStats[bucket].success++;
          consecutiveFails = 0;
          console.log(`  ✓ ${row.pubmed_id} (${bucket}) — ${JSON.stringify(values)}`);

        } catch (e) {
          aiError = e instanceof Error ? e.message : String(e);
          console.error(`  ✗ ${row.pubmed_id} (${bucket}): ${aiError}`);

          errorCount++;
          bucketStats[bucket].error++;
          consecutiveFails++;
          allErrors.push({ pubmed_id: row.pubmed_id, error: aiError });

          // Write error to DB so we can track it
          await admin
            .from("geo_parser_run_1000")
            .update({
              ai_error:     aiError,
              ai_scored_at: new Date().toISOString(),
              ai_raw_response: aiRawResponse,
            })
            .eq("id", row.id)
            .then(({ error: e2 }: { error: { message: string } | null }) => {
              if (e2) console.error(`    (also failed to write ai_error: ${e2.message})`);
            });

          if (consecutiveFails >= HARD_STOP_AFTER) {
            console.error(`\n[geo-ai-scoring] HARD STOP: ${HARD_STOP_AFTER} consecutive failures. Aborting.`);
          }
        }
      })
    )
  );

  // ── Final report ─────────────────────────────────────────────────────────────

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  // Cost estimate (Haiku: $1.00/1M input, $5.00/1M output)
  const costUsd = (totalInputTokens * 1.00 + totalOutputTokens * 5.00) / 1_000_000;

  console.log("\n══════════════════════════════════════════════");
  console.log("  Geo AI Scoring — Final Report");
  console.log("══════════════════════════════════════════════");
  console.log(`  Total rows:        ${rows.length}`);
  console.log(`  Success:           ${successCount}`);
  console.log(`  Error:             ${errorCount}`);
  console.log(`  Elapsed:           ${elapsedSec}s`);
  if (!DRY_RUN) {
    console.log(`  Input tokens:      ${totalInputTokens.toLocaleString()}`);
    console.log(`  Output tokens:     ${totalOutputTokens.toLocaleString()}`);
    console.log(`  Est. cost:         $${costUsd.toFixed(4)}`);
  }

  console.log("\n  Per-bucket breakdown:");
  for (const [b, stat] of Object.entries(bucketStats).sort()) {
    console.log(`    ${b.padEnd(24)} ✓ ${stat.success}  ✗ ${stat.error}`);
  }

  if (allErrors.length > 0) {
    console.log("\n  Errors:");
    for (const e of allErrors) {
      console.log(`    ${e.pubmed_id ?? "(no id)"}: ${e.error}`);
    }
  }

  if (consecutiveFails >= HARD_STOP_AFTER) {
    console.log("\n  ⚠ Script was hard-stopped after consecutive failures.");
    process.exit(1);
  }

  console.log("\n  Done.\n");
}

main().catch((e) => {
  console.error("[geo-ai-scoring] Fatal:", e);
  process.exit(1);
});
