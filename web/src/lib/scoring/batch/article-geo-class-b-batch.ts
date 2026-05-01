// Article Geo Class B batch — AI post-processing for multi-address Klasse B affiliations.
// Mirrors article-geo-class-a-batch.ts but operates per-article on article_geo_addresses
// rows (not flat articles.geo_*). AI may change row count via merge/split/drop/new.
//
// custom_id = article_id (UUID).

import { createAdminClient } from "@/lib/supabase/admin";
import { recordBatchUsage } from "@/lib/ai/tracked-client";
import { getRegion, getContinent } from "@/lib/geo/country-map";
import { enrichArticleAddresses } from "@/lib/geo/v2/address-enrichment";
import { getBatchResults, submitBatch, type BatchRequest } from "./client";

export { submitBatch };

const GEO_AI_MODEL      = "claude-haiku-4-5-20251001";
const GEO_AI_MAX_TOKENS = 2048;

// ── Types ─────────────────────────────────────────────────────────────────────

interface DbAddressRow {
  id:                    string;
  position:              number;
  city:                  string | null;
  state:                 string | null;
  country:               string | null;
  institution:           string | null;
  institution2:          string | null;
  institution3:          string | null;
  institutions_overflow: string[];
  department:            string | null;
  department2:           string | null;
  department3:           string | null;
  departments_overflow:  string[];
  confidence:            string | null;
}

interface ArticleContext {
  id:              string;
  pubmed_id:       string;
  affiliation_raw: string | null;
  rows:            DbAddressRow[];
}

interface AiAddress {
  position:              number;
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
  action:                "kept" | "merged" | "split" | "dropped" | "new";
}

interface AiOutput {
  addresses: AiAddress[];
  changes:   string[];
}

export interface PrepareOptions {
  limit?:     number;
  specialty?: string;
  edat_from?: string;
  edat_to?:   string;
}

export interface PreparedBatch {
  activePrompt: { version: string; prompt_text: string };
  articles:     ArticleContext[];
  requests:     BatchRequest[];
  customIdMap:  Record<string, string>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildUserPrompt(article: ArticleContext): string {
  const parserRows = article.rows.map((r, i) => ({
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
    `ORIGINAL AFFILIATION:\n${article.affiliation_raw ?? "(ingen)"}\n\n` +
    `PARSER OUTPUT (${article.rows.length} adresse${article.rows.length !== 1 ? "r" : ""}):\n` +
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
    action:                ["kept","merged","split","dropped","new"].includes(a.action) ? a.action : "kept",
  }));
  return { addresses, changes: Array.isArray(obj.changes) ? obj.changes : [] };
}

// ── Apply AI result (shared by ingest + sync test) ────────────────────────────

/**
 * Replace article_geo_addresses rows for an article with the AI's output.
 * Region/continent enriched deterministically from country.
 * state_source = 'ai' for rows where AI set state, else null (will be filled
 * by enrichArticleAddresses).
 */
export async function applyClassBAiResult(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  article_id: string,
  output: AiOutput
): Promise<void> {
  const now = new Date().toISOString();

  await db.from("article_geo_addresses").delete().eq("article_id", article_id);

  if (output.addresses.length > 0) {
    const insertRows = output.addresses.map((addr) => ({
      article_id,
      position:              addr.position,
      city:                  addr.city,
      state:                 addr.state,
      country:               addr.country,
      region:                addr.country ? getRegion(addr.country) : null,
      continent:             addr.country ? getContinent(addr.country) : null,
      institution:           addr.institution,
      institution2:          addr.institution2,
      institution3:          addr.institution3,
      institutions_overflow: addr.institutions_overflow,
      department:            addr.department,
      department2:           addr.department2,
      department3:           addr.department3,
      departments_overflow:  addr.departments_overflow,
      confidence:            addr.confidence,
      ai_processed_at:       now,
      ai_changes:            output.changes,
      ai_action:             addr.action,
      state_source:          addr.state ? "ai" : null,
    }));
    await db.from("article_geo_addresses").insert(insertRows);
  }

  // Fill missing states via geo_cities (state_source='enrichment' on hits)
  await enrichArticleAddresses(article_id);
}

/** Mark every existing address row as too_long (for JSON-failed/oversized responses). */
async function markTooLong(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  article_id: string
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .from("article_geo_addresses")
    .update({ ai_action: "too_long", ai_processed_at: now })
    .eq("article_id", article_id)
    .is("ai_processed_at", null);
}

// ── Prepare ───────────────────────────────────────────────────────────────────

export async function prepareArticleGeoClassBBatch(
  options: PrepareOptions
): Promise<PreparedBatch> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // 1. Active prompt
  const { data: promptRow, error: promptErr } = await admin
    .from("model_versions")
    .select("version, prompt_text")
    .eq("module", "article_geo_class_b")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (promptErr || !promptRow) {
    throw new Error("No active prompt found for module 'article_geo_class_b'");
  }
  const activePrompt = {
    version:     promptRow.version     as string,
    prompt_text: promptRow.prompt_text as string,
  };

  // 2. Candidate article_ids via RPC
  const { data: candidates, error: candErr } = await admin.rpc(
    "get_article_geo_class_b_candidates",
    { p_specialty: options.specialty ?? "neurosurgery", p_limit: options.limit ?? 1000,
      p_edat_from: options.edat_from ?? null, p_edat_to: options.edat_to ?? null }
  );
  if (candErr) throw new Error(`Failed to fetch class B candidates: ${candErr.message}`);

  const ids = (candidates as Array<{ article_id: string }>).map((r) => r.article_id);

  if (ids.length === 0) {
    return { activePrompt, articles: [], requests: [], customIdMap: {} };
  }

  // 3. Fetch articles + their address rows
  const { data: articleRows, error: artErr } = await admin
    .from("articles")
    .select("id, pubmed_id, authors")
    .in("id", ids);
  if (artErr) throw new Error(`Failed to fetch articles: ${artErr.message}`);

  const { data: addressRows, error: addrErr } = await admin
    .from("article_geo_addresses")
    .select("id, article_id, position, city, state, country, institution, institution2, institution3, institutions_overflow, department, department2, department3, departments_overflow, confidence")
    .in("article_id", ids)
    .order("position");
  if (addrErr) throw new Error(`Failed to fetch address rows: ${addrErr.message}`);

  // Group addresses by article_id
  const addrByArticle = new Map<string, DbAddressRow[]>();
  for (const r of (addressRows ?? []) as Array<DbAddressRow & { article_id: string }>) {
    const list = addrByArticle.get(r.article_id) ?? [];
    list.push(r);
    addrByArticle.set(r.article_id, list);
  }

  // 4. Build ArticleContext for each
  const articles: ArticleContext[] = [];
  for (const row of (articleRows ?? []) as Array<{ id: string; pubmed_id: string; authors: unknown }>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a0 = (Array.isArray(row.authors) && row.authors[0]) as any;
    const aff: string | null = a0
      ? (a0.affiliation as string ?? (Array.isArray(a0.affiliations) ? (a0.affiliations as string[])[0] : null))
      : null;
    articles.push({
      id:              row.id,
      pubmed_id:       row.pubmed_id,
      affiliation_raw: aff,
      rows:            addrByArticle.get(row.id) ?? [],
    });
  }

  // 5. Build batch requests (custom_id = article_id)
  const requests: BatchRequest[] = [];
  const customIdMap: Record<string, string> = {};
  for (const article of articles) {
    customIdMap[article.id] = article.id;
    requests.push({
      custom_id: article.id,
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

export async function ingestArticleGeoClassBBatchResults(
  anthropicBatchId: string,
  customIdMap:      Record<string, string>,
  promptVersion:    string
): Promise<{ scored: number; failed: number; failedIds: string[] }> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  let scored = 0;
  const failedIds: string[] = [];

  for await (const line of getBatchResults(anthropicBatchId)) {
    const article_id = customIdMap[line.custom_id];
    if (!article_id) {
      console.warn(`[ingestGeoClassB] unknown custom_id: ${line.custom_id}`);
      continue;
    }

    if (line.result.type !== "succeeded") {
      console.warn(`[ingestGeoClassB] non-succeeded for ${article_id}: ${line.result.type}`);
      await markTooLong(db, article_id);
      failedIds.push(article_id);
      continue;
    }

    const rawText = (line.result.message!.content[0] as { type: string; text: string }).text.trim();
    let output: AiOutput;
    try {
      output = parseJsonResponse(rawText);
    } catch (e) {
      console.warn(`[ingestGeoClassB] JSON parse failed for ${article_id}: ${(e as Error).message}`);
      await markTooLong(db, article_id);
      failedIds.push(article_id);
      continue;
    }

    try {
      await applyClassBAiResult(db, article_id, output);
    } catch (e) {
      console.error(`[ingestGeoClassB] applyClassBAiResult failed for ${article_id}: ${(e as Error).message}`);
      failedIds.push(article_id);
      continue;
    }

    const now = new Date().toISOString();
    const { error: metaErr } = await db.from("article_geo_metadata").update({
      class_b_address_count: output.addresses.length,
      ai_changes:            output.changes,
      ai_processed_at:       now,
      ai_model:              GEO_AI_MODEL,
      ai_prompt_version:     promptVersion,
      enriched_at:           now,
      updated_at:            now,
    }).eq("article_id", article_id);
    if (metaErr) {
      console.error(`[ingestGeoClassB] metadata update failed for ${article_id}: ${metaErr.message}`);
    }

    recordBatchUsage({
      modelKey:         `geo_class_b_${promptVersion}`,
      model:            line.result.message!.model,
      promptTokens:     line.result.message!.usage.input_tokens,
      completionTokens: line.result.message!.usage.output_tokens,
      articleId:        article_id,
      task:             "article_geo_class_b",
    });

    scored++;
  }

  return { scored, failed: failedIds.length, failedIds };
}

// ── Synchronous helper for tests / one-offs ──────────────────────────────────

/**
 * Synchronous (non-batch) variant for testing or ad-hoc runs on a small set of
 * articles. Calls Anthropic directly, applies the same ingest write logic.
 */
export async function processArticleSync(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  article: ArticleContext,
  systemPrompt: string,
  promptVersion: string
): Promise<{ ok: boolean; addresses_in: number; addresses_out?: number; changes?: string[]; error?: string }> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  let output: AiOutput;
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
    return { ok: false, addresses_in: article.rows.length, error: (e as Error).message };
  }

  await applyClassBAiResult(db, article.id, output);

  const now = new Date().toISOString();
  await db.from("article_geo_metadata").update({
    class_b_address_count: output.addresses.length,
    ai_changes:            output.changes,
    ai_processed_at:       now,
    ai_model:              GEO_AI_MODEL,
    ai_prompt_version:     promptVersion,
    enriched_at:           now,
    updated_at:            now,
  }).eq("article_id", article.id);

  return {
    ok:            true,
    addresses_in:  article.rows.length,
    addresses_out: output.addresses.length,
    changes:       output.changes,
  };
}
