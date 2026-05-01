// Article Geo Class A batch — AI post-processing for challenging Klasse A affiliations.
// Follows the same pattern as specialty-batch.ts.

import { createAdminClient } from "@/lib/supabase/admin";
import { recordBatchUsage } from "@/lib/ai/tracked-client";
import { getBatchResults, submitBatch, type BatchRequest } from "./client";

export { submitBatch };

const GEO_AI_MODEL = "claude-haiku-4-5-20251001";
const GEO_AI_MAX_TOKENS = 1024;

// ── Types ─────────────────────────────────────────────────────────────────────

interface GeoArticleRow {
  id: string;
  pubmed_id: string;
  affiliation_raw: string | null;
  geo_class: string | null;
  geo_city: string | null;
  geo_state: string | null;
  geo_country: string | null;
  geo_institution: string | null;
  geo_institution2: string | null;
  geo_institution3: string | null;
  geo_institutions_overflow: string[];
  geo_department: string | null;
  geo_department2: string | null;
  geo_department3: string | null;
  geo_departments_overflow: string[];
  geo_confidence: string | null;
}

interface GeoAiOutput {
  department: string | null;
  department2: string | null;
  department3: string | null;
  departments_overflow: string[];
  institution: string | null;
  institution2: string | null;
  institution3: string | null;
  institutions_overflow: string[];
  city: string | null;
  state: string | null;
  country: string | null;
  confidence: "high" | "low";
  changes: string[];
}

export interface PrepareOptions {
  limit?: number;
  edat_from?: string;
  edat_to?: string;
}

export interface PreparedBatch {
  activePrompt: { version: string; prompt_text: string };
  articles: GeoArticleRow[];
  requests: BatchRequest[];
  customIdMap: Record<string, string>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildUserPrompt(row: GeoArticleRow): string {
  const parserOutput = {
    department:            row.geo_department,
    department2:           row.geo_department2,
    department3:           row.geo_department3,
    departments_overflow:  row.geo_departments_overflow,
    institution:           row.geo_institution,
    institution2:          row.geo_institution2,
    institution3:          row.geo_institution3,
    institutions_overflow: row.geo_institutions_overflow,
    city:                  row.geo_city,
    state:                 row.geo_state,
    country:               row.geo_country,
    confidence:            row.geo_confidence,
  };
  return (
    `ORIGINAL AFFILIATION:\n${row.affiliation_raw ?? "(ingen)"}\n\n` +
    `PARSER OUTPUT:\n${JSON.stringify(parserOutput, null, 2)}\n\n` +
    `Returnér korrigeret output som JSON.`
  );
}

function parseJsonResponse(text: string): GeoAiOutput {
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

// ── Prepare ───────────────────────────────────────────────────────────────────

export async function prepareArticleGeoClassABatch(
  options: PrepareOptions
): Promise<PreparedBatch> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // 1. Fetch active prompt
  const { data: promptRow, error: promptErr } = await admin
    .from("model_versions")
    .select("version, prompt_text")
    .eq("module", "article_geo_class_a")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (promptErr || !promptRow) {
    throw new Error("No active prompt found for module 'article_geo_class_a'");
  }
  const activePrompt = {
    version:     promptRow.version     as string,
    prompt_text: promptRow.prompt_text as string,
  };

  // 2. Fetch candidate articles via RPC
  const { data: rows, error: rowsErr } = await admin.rpc(
    "get_article_geo_class_a_candidates",
    {
      p_limit:     options.limit     ?? 10000,
      p_edat_from: options.edat_from ?? null,
      p_edat_to:   options.edat_to   ?? null,
    }
  );

  if (rowsErr) throw new Error(`Failed to fetch geo candidates: ${rowsErr.message}`);

  const articles = (rows ?? []) as GeoArticleRow[];

  // 3. Build batch requests
  const requests: BatchRequest[] = [];
  const customIdMap: Record<string, string> = {};

  for (const article of articles) {
    const custom_id = article.id; // UUID is well within 64-char limit
    customIdMap[custom_id] = article.id;
    requests.push({
      custom_id,
      params: {
        model:      GEO_AI_MODEL,
        max_tokens: GEO_AI_MAX_TOKENS,
        system:     activePrompt.prompt_text,
        messages:   [{ role: "user", content: buildUserPrompt(article) }],
      },
    });
  }

  return { activePrompt, articles, requests, customIdMap };
}

// ── Ingest ────────────────────────────────────────────────────────────────────

export async function ingestArticleGeoClassABatchResults(
  anthropicBatchId: string,
  customIdMap: Record<string, string>,
  promptVersion: string
): Promise<{ scored: number; failed: number; failedIds: string[] }> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  let scored = 0;
  const failedIds: string[] = [];

  for await (const line of getBatchResults(anthropicBatchId)) {
    const article_id = customIdMap[line.custom_id];
    if (!article_id) {
      console.warn(`[ingestGeoClassA] unknown custom_id: ${line.custom_id}`);
      continue;
    }

    if (line.result.type !== "succeeded") {
      console.warn(`[ingestGeoClassA] non-succeeded for ${article_id}: ${line.result.type}`);
      failedIds.push(article_id);
      continue;
    }

    const rawText = (line.result.message!.content[0] as { type: string; text: string }).text.trim();
    let output: GeoAiOutput;
    try {
      output = parseJsonResponse(rawText);
    } catch (e) {
      console.warn(`[ingestGeoClassA] JSON parse failed for ${article_id}: ${(e as Error).message}`);
      failedIds.push(article_id);
      continue;
    }

    const now = new Date().toISOString();

    // 1. Update articles geo fields (geo_class stays 'A')
    const { error: articleErr } = await db.from("articles").update({
      geo_institution:           output.institution,
      geo_institution2:          output.institution2,
      geo_institution3:          output.institution3,
      geo_institutions_overflow: output.institutions_overflow,
      geo_department:            output.department,
      geo_department2:           output.department2,
      geo_department3:           output.department3,
      geo_departments_overflow:  output.departments_overflow,
      geo_city:                  output.city,
      geo_state:                 output.state,
      geo_country:               output.country,
      geo_parser_confidence:     output.confidence,
    }).eq("id", article_id);

    if (articleErr) {
      console.error(`[ingestGeoClassA] articles update failed for ${article_id}: ${articleErr.message}`);
      failedIds.push(article_id);
      continue;
    }

    // 2. Update article_geo_metadata
    const { error: metaErr } = await db.from("article_geo_metadata").update({
      ai_processed_at:   now,
      ai_model:          GEO_AI_MODEL,
      ai_prompt_version: promptVersion,
      ai_changes:        output.changes,
      geo_confidence:    output.confidence,
      updated_at:        now,
    }).eq("article_id", article_id);

    if (metaErr) {
      console.error(`[ingestGeoClassA] metadata update failed for ${article_id}: ${metaErr.message}`);
      // articles was updated — don't count as failed
    }

    recordBatchUsage({
      modelKey:         `geo_class_a_${promptVersion}`,
      model:            line.result.message!.model,
      promptTokens:     line.result.message!.usage.input_tokens,
      completionTokens: line.result.message!.usage.output_tokens,
      articleId:        article_id,
      task:             "article_geo_class_a",
    });

    scored++;
  }

  return { scored, failed: failedIds.length, failedIds };
}
