// Article Geo Class A batch — AI post-processing for challenging Klasse A affiliations.
// Reads from and writes to article_geo_addresses (position=1).
// Does NOT touch articles.geo_* flat fields — those are kept for old data only.

import { createAdminClient } from "@/lib/supabase/admin";
import { recordBatchUsage } from "@/lib/ai/tracked-client";
import { getRegion, getContinent } from "@/lib/geo/country-map";
import { enrichArticleAddresses } from "@/lib/geo/v2/address-enrichment";
import { getBatchResults, submitBatch, type BatchRequest } from "./client";

export { submitBatch };

const GEO_AI_MODEL      = "claude-haiku-4-5-20251001";
const GEO_AI_MAX_TOKENS = 1024;

// ── Types ─────────────────────────────────────────────────────────────────────

interface GeoArticleRow {
  id:                    string;   // article UUID
  pubmed_id:             string;
  affiliation_raw:       string | null;
  geo_class:             string | null;
  addr_row_id:           string;   // article_geo_addresses.id UUID
  city:                  string | null;
  state:                 string | null;
  country:               string | null;
  region:                string | null;
  continent:             string | null;
  institution:           string | null;
  institution2:          string | null;
  institution3:          string | null;
  institutions_overflow: string[];
  department:            string | null;
  department2:           string | null;
  department3:           string | null;
  departments_overflow:  string[];
  confidence:            string | null;
  geo_confidence:        string | null;
}

interface GeoAiOutput {
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

export interface PrepareOptions {
  limit?:     number;
  edat_from?: string;
  edat_to?:   string;
}

export interface PreparedBatch {
  activePrompt: { version: string; prompt_text: string };
  articles:     GeoArticleRow[];
  requests:     BatchRequest[];
  customIdMap:  Record<string, string>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildUserPrompt(row: GeoArticleRow): string {
  const parserOutput = {
    department:            row.department,
    department2:           row.department2,
    department3:           row.department3,
    departments_overflow:  row.departments_overflow,
    institution:           row.institution,
    institution2:          row.institution2,
    institution3:          row.institution3,
    institutions_overflow: row.institutions_overflow,
    city:                  row.city,
    state:                 row.state,
    country:               row.country,
    confidence:            row.confidence,
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

// ── Apply AI result to article_geo_addresses (shared by ingest + sync test) ──

export async function applyClassAAiResult(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  addrRowId:  string,
  articleId:  string,
  prevState:  string | null,
  output:     GeoAiOutput
): Promise<void> {
  const now     = new Date().toISOString();
  const region  = output.country ? getRegion(output.country)    : null;
  const continent = output.country ? getContinent(output.country) : null;

  await db.from("article_geo_addresses").update({
    city:                  output.city,
    state:                 output.state,
    country:               output.country,
    region,
    continent,
    institution:           output.institution,
    institution2:          output.institution2,
    institution3:          output.institution3,
    institutions_overflow: output.institutions_overflow,
    department:            output.department,
    department2:           output.department2,
    department3:           output.department3,
    departments_overflow:  output.departments_overflow,
    confidence:            output.confidence,
    ai_processed_at:       now,
    ai_changes:            output.changes,
    ai_action:             "kept",
    state_source:          output.state
      ? (output.state !== prevState ? "ai" : undefined)
      : undefined,
    updated_at:            now,
  }).eq("id", addrRowId);

  // Fill any still-missing states via geo_cities
  await enrichArticleAddresses(articleId);
}

// ── Prepare ───────────────────────────────────────────────────────────────────

export async function prepareArticleGeoClassABatch(
  options: PrepareOptions
): Promise<PreparedBatch> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

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

  const requests:   BatchRequest[]          = [];
  const customIdMap: Record<string, string>  = {};

  for (const article of articles) {
    const custom_id = article.id;
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
  customIdMap:      Record<string, string>,
  promptVersion:    string
): Promise<{ scored: number; failed: number; failedIds: string[] }> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  // Build article_id → addr_row_id + prev_state map from the customIdMap
  // by fetching article_geo_addresses for all article_ids in the batch
  const articleIds = Object.values(customIdMap);
  const { data: addrRows } = await db
    .from("article_geo_addresses")
    .select("id, article_id, state")
    .in("article_id", articleIds)
    .eq("position", 1);

  const addrMap = new Map<string, { addrRowId: string; prevState: string | null }>(
    ((addrRows ?? []) as Array<{ id: string; article_id: string; state: string | null }>)
      .map((r) => [r.article_id, { addrRowId: r.id, prevState: r.state }])
  );

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

    const addrInfo = addrMap.get(article_id);
    if (!addrInfo) {
      console.warn(`[ingestGeoClassA] no addr row found for ${article_id}`);
      failedIds.push(article_id);
      continue;
    }

    try {
      await applyClassAAiResult(db, addrInfo.addrRowId, article_id, addrInfo.prevState, output);
    } catch (e) {
      console.error(`[ingestGeoClassA] applyClassAAiResult failed for ${article_id}: ${(e as Error).message}`);
      failedIds.push(article_id);
      continue;
    }

    const now = new Date().toISOString();
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

// ── Synchronous helper for tests / one-offs ───────────────────────────────────

export async function processArticleGeoASync(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  article:      GeoArticleRow,
  systemPrompt: string,
  promptVersion: string
): Promise<{ ok: boolean; changes?: string[]; error?: string }> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  let output: GeoAiOutput;
  try {
    const msg = await client.messages.create({
      model:      GEO_AI_MODEL,
      max_tokens: GEO_AI_MAX_TOKENS,
      system:     systemPrompt,
      messages:   [{ role: "user", content: buildUserPrompt(article) }],
    });
    const rawText = (msg.content[0] as { type: string; text: string }).text.trim();
    output = parseJsonResponse(rawText);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  await applyClassAAiResult(db, article.addr_row_id, article.id, article.state, output);

  const now = new Date().toISOString();
  await db.from("article_geo_metadata").update({
    ai_processed_at:   now,
    ai_model:          GEO_AI_MODEL,
    ai_prompt_version: promptVersion,
    ai_changes:        output.changes,
    geo_confidence:    output.confidence,
    updated_at:        now,
  }).eq("article_id", article.id);

  return { ok: true, changes: output.changes };
}
