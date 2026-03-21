/**
 * rescore-articles.ts
 *
 * One-off script: rescores a hardcoded list of article IDs using the active
 * specialty_tag prompt and writes ai_decision, specialty_confidence,
 * specialty_reasoning, model_version, and specialty_scored_at back to the DB.
 *
 * Run from web/:
 *   npx tsx scripts/rescore-articles.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// ── Load .env.local ────────────────────────────────────────────────────────
const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (key && !process.env[key]) process.env[key] = val;
}

// ── Config ─────────────────────────────────────────────────────────────────

// Leave empty to auto-fetch: all pending articles with active model_version
// but missing specialty_reasoning (no lab_decision yet).
// Or hardcode specific IDs to rescore only those.
const ARTICLE_IDS: string[] = [
  "cb95450c-b1b8-49c6-8ef6-f422233bfb33",
];

// The specialty slug used to look up the active prompt:
const SPECIALTY = "neurosurgery";

const SCORING_MODEL = process.env.AI_SCORING_MODEL ?? "claude-haiku-4-5-20251001";
const DELAY_MS = 1300; // stay under 50 req/min

// ── Clients ────────────────────────────────────────────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anthropicKey = process.env.ANTHROPIC_API_KEY!;

if (!supabaseUrl || !serviceKey || !anthropicKey) {
  console.error("Missing required env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY)");
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient<any>(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const ai = new Anthropic({ apiKey: anthropicKey });

// ── Types ──────────────────────────────────────────────────────────────────
type ArticleRow = {
  id: string;
  title: string;
  abstract: string | null;
};

type ScoreResult = {
  ai_decision: "approved" | "rejected";
  confidence: number;
  reason: string | null;
  version: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────
async function getActivePrompt(specialty: string): Promise<{ prompt: string; version: string }> {
  const { data, error } = await db
    .from("model_versions")
    .select("prompt_text, version")
    .eq("specialty", specialty)
    .eq("module", "specialty_tag")
    .eq("active", true)
    .limit(1)
    .single();

  if (error || !data?.prompt_text || !data?.version) {
    throw new Error(`No active prompt for specialty "${specialty}": ${error?.message ?? "empty result"}`);
  }
  return { prompt: data.prompt_text as string, version: data.version as string };
}

async function scoreArticle(article: ArticleRow, specialty: string, activePrompt: { prompt: string; version: string }): Promise<ScoreResult> {
  const content = activePrompt.prompt
    .replace(/\{\{specialty\}\}|\{specialty\}/g,   specialty)
    .replace(/\{\{title\}\}|\{title\}/g,           article.title)
    .replace(/\{\{abstract\}\}|\{abstract\}/g,     article.abstract ?? "No abstract available");

  const message = await ai.messages.create({
    model:      SCORING_MODEL,
    max_tokens: 512,
    messages:   [{ role: "user", content }],
  });

  const raw = (message.content[0] as { type: string; text: string }).text.trim();

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as {
      decision?: string;
      confidence?: number;
      reason?: string;
    };
    const confidence  = Math.min(100, Math.max(0, Math.round(Number(parsed.confidence ?? 50))));
    const ai_decision: "approved" | "rejected" = parsed.decision === "approved" ? "approved" : "rejected";
    const reason      = typeof parsed.reason === "string" ? parsed.reason.slice(0, 500) : null;
    return { ai_decision, confidence, reason, version: activePrompt.version };
  } catch {
    const match      = raw.match(/\d+/);
    const confidence = match ? Math.min(100, Math.max(0, parseInt(match[0], 10))) : 50;
    return { ai_decision: confidence >= 50 ? "approved" : "rejected", confidence, reason: null, version: activePrompt.version };
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const activePrompt = await getActivePrompt(SPECIALTY);
  console.log(`Active prompt: ${activePrompt.version}\n`);

  let rows: ArticleRow[];

  if (ARTICLE_IDS.length > 0) {
    // Explicit list
    const { data, error } = await db
      .from("articles")
      .select("id, title, abstract")
      .in("id", ARTICLE_IDS);
    if (error) { console.error("Failed to fetch articles:", error.message); process.exit(1); }
    rows = (data ?? []) as ArticleRow[];
    const missing = ARTICLE_IDS.filter((id) => !rows.find((r) => r.id === id));
    if (missing.length > 0) {
      console.warn(`Warning: ${missing.length} ID(s) not found in DB:\n  ${missing.join("\n  ")}\n`);
    }
  } else {
    // Auto-fetch: pending articles with active model_version, no reasoning, no lab_decision
    const { data, error } = await db
      .from("articles")
      .select("id, title, abstract")
      .eq("status", "pending")
      .eq("model_version", activePrompt.version)
      .not("specialty_confidence", "is", null)
      .is("specialty_reasoning", null)
      .not("id", "in", `(select article_id from lab_decisions where module = 'specialty_tag')`)
      .limit(200);
    if (error) { console.error("Failed to auto-fetch articles:", error.message); process.exit(1); }
    rows = (data ?? []) as ArticleRow[];
    console.log(`Auto-fetched ${rows.length} article(s) missing reasoning for ${activePrompt.version}\n`);
  }

  if (rows.length === 0) {
    console.log("No articles to rescore.");
    process.exit(0);
  }

  console.log(`Rescoring ${rows.length} article(s) for specialty "${SPECIALTY}"…\n`);

  let succeeded = 0;
  let failed    = 0;

  for (const article of rows) {
    await new Promise((r) => setTimeout(r, DELAY_MS));

    try {
      const score = await scoreArticle(article, SPECIALTY, activePrompt);

      console.log("reason:", score.reason);
      const { error: updateError } = await db
        .from("articles")
        .update({
          ai_decision:          score.ai_decision,
          specialty_confidence: score.confidence,
          specialty_reasoning:  score.reason,
          model_version:        score.version,
          specialty_scored_at:  new Date().toISOString(),
        })
        .eq("id", article.id);

      if (updateError) throw new Error(updateError.message);

      console.log(`✓ ${article.id}  ${score.ai_decision.padEnd(8)} ${score.confidence}%  ${score.reason?.slice(0, 60) ?? ""}`);
      succeeded++;
    } catch (e) {
      console.error(`✗ ${article.id}  ERROR: ${(e as Error).message}`);
      failed++;
    }
  }

  console.log(`\nDone — ${succeeded} succeeded, ${failed} failed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
