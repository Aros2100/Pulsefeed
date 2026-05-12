// Run a prompt version against every article in the module and store one
// row per (prompt_id, article_id) in lab_value_article_scores.
//
// The prompt text goes verbatim into the system message. The article's
// scoring fields are formatted into a structured user message. The AI is
// instructed to return JSON of shape { "score": number, "reasoning": string }.
// Unparseable responses are stored with score = null and the raw text in
// raw_response for debugging.

import { trackedCall } from "@/lib/ai/tracked-client";
import {
  QUICK_TEST_BOTTOM,
  QUICK_TEST_MIDDLE,
  QUICK_TEST_TOP,
  SCORING_CONCURRENCY,
  SCORING_MAX_TOKENS,
  SCORING_MODEL,
} from "./craft-config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface ScoringArticle {
  id:              string;
  title:           string;
  journal:         string | null;
  article_type:    string | null;
  short_headline:  string | null;
  resume:          string | null;
  bottom_line:     string | null;
  sari:            unknown;
}

export interface ParsedScore {
  score:     number | null;
  reasoning: string | null;
}

export interface ScoringSummary {
  total:        number;
  succeeded:    number;
  failed:       number;
  durationMs:   number;
  promptVersion: number;
}

function fmtField(label: string, value: string | null | undefined): string {
  return `${label}: ${value && value.trim().length > 0 ? value.trim() : "—"}`;
}

function fmtSari(sari: unknown): string {
  if (!sari || typeof sari !== "object") return "SARI: —";
  const s = sari as Record<string, unknown>;
  const subject     = typeof s.subject     === "string" ? s.subject     : null;
  const action      = typeof s.action      === "string" ? s.action      : null;
  const result      = typeof s.result      === "string" ? s.result      : null;
  const implication = typeof s.implication === "string" ? s.implication : null;
  return [
    "SARI:",
    `  Subject: ${subject ?? "—"}`,
    `  Action: ${action ?? "—"}`,
    `  Result: ${result ?? "—"}`,
    `  Implication: ${implication ?? "—"}`,
  ].join("\n");
}

export function buildUserMessage(article: ScoringArticle): string {
  return [
    fmtField("Title", article.title),
    fmtField("Article type", article.article_type),
    fmtField("Journal", article.journal),
    fmtField("Short headline", article.short_headline),
    fmtField("Resume", article.resume),
    fmtField("Bottom line", article.bottom_line),
    fmtSari(article.sari),
  ].join("\n");
}

export function buildScoringRequest(article: ScoringArticle, promptText: string, modelOverride?: string) {
  return {
    model:      modelOverride ?? SCORING_MODEL,
    max_tokens: SCORING_MAX_TOKENS,
    thinking:   { type: "disabled" as const },
    system: [
      promptText,
      "",
      "Respond only with valid JSON of the form {\"score\": <number>, \"reasoning\": <string>}.",
      "No other text, no markdown fences.",
    ].join("\n"),
    messages: [{ role: "user" as const, content: buildUserMessage(article) }],
  };
}

export function parseScoringResponse(rawText: string): ParsedScore {
  try {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) return { score: null, reasoning: null };
    const parsed = JSON.parse(match[0]) as { score?: unknown; reasoning?: unknown };
    const rawScore = parsed.score;
    let score: number | null = null;
    if (typeof rawScore === "number" && Number.isFinite(rawScore)) {
      score = rawScore;
    } else if (typeof rawScore === "string" && rawScore.trim().length > 0) {
      const n = Number(rawScore);
      if (Number.isFinite(n)) score = n;
    }
    const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : null;
    return { score, reasoning };
  } catch {
    return { score: null, reasoning: null };
  }
}

async function runInChunks<T, R>(items: T[], chunkSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const settled = await Promise.all(chunk.map(fn));
    out.push(...settled);
  }
  return out;
}

export type ScoringMode = "quick" | "full" | "disagreements";

/**
 * Returns the unique article ids appearing in the parent prompt's disagreement
 * pairs. Used by the "Score disagreement articles only" iteration step: the
 * new version re-scores just these articles, while inheriting scores for the
 * rest from the parent chain.
 */
export async function selectDisagreementArticleIds(db: Db, promptId: string): Promise<string[]> {
  const { data: prompt } = await db
    .from("lab_value_prompts")
    .select("module_id, parent_prompt_id")
    .eq("id", promptId)
    .maybeSingle();
  if (!prompt) throw new Error("Prompt not found");
  const p = prompt as { module_id: string; parent_prompt_id: string | null };
  if (!p.parent_prompt_id) {
    throw new Error("This version has no parent — disagreement-only scoring requires a prior version to compare against");
  }

  // Pull the parent's scores and the module's decided pairs
  const [{ data: scores }, { data: pairs }] = await Promise.all([
    db.from("lab_value_article_scores")
      .select("article_id, score")
      .eq("prompt_id", p.parent_prompt_id)
      .not("score", "is", null),
    db.from("lab_value_pairs")
      .select("article_a_id, article_b_id, winner_id")
      .eq("module_id", p.module_id)
      .not("winner_id", "is", null),
  ]);

  type ScoreRow = { article_id: string; score: number | string };
  const scoreMap = new Map<string, number>();
  for (const r of (scores ?? []) as ScoreRow[]) {
    const n = Number(r.score);
    if (Number.isFinite(n)) scoreMap.set(r.article_id, n);
  }

  type Pair = { article_a_id: string; article_b_id: string; winner_id: string };
  const decided = (pairs ?? []) as Pair[];

  const ids = new Set<string>();
  for (const pair of decided) {
    const sa = scoreMap.get(pair.article_a_id);
    const sb = scoreMap.get(pair.article_b_id);
    if (sa === undefined || sb === undefined) continue;
    if (sa === sb) continue; // tie, skip
    const promptChoice = sa > sb ? pair.article_a_id : pair.article_b_id;
    if (promptChoice !== pair.winner_id) {
      ids.add(pair.article_a_id);
      ids.add(pair.article_b_id);
    }
  }

  return [...ids];
}

/**
 * Pick the quick-test article set: top N, bottom N, and middle N by β.
 * Returns the article ids. Requires that Bradley-Terry has been computed for
 * the module (lab_value_rankings populated).
 */
export async function selectQuickArticleIds(db: Db, moduleId: string): Promise<string[]> {
  const { data: rankings } = await db
    .from("lab_value_rankings")
    .select("article_id, beta_score")
    .eq("module_id", moduleId);

  type R = { article_id: string; beta_score: number | string };
  const rows = ((rankings ?? []) as R[]).map(r => ({
    article_id: r.article_id,
    beta:       Number(r.beta_score),
  }));

  if (rows.length === 0) {
    throw new Error("Bradley-Terry ranking has not been computed for this module — compute it before running quick test");
  }

  // Sort by β descending
  rows.sort((a, b) => b.beta - a.beta);

  const top    = rows.slice(0, QUICK_TEST_TOP);
  const bottom = rows.slice(Math.max(0, rows.length - QUICK_TEST_BOTTOM));

  // Middle: the N articles whose β is closest to 0 (centered ranking).
  const middlePool = rows.slice(QUICK_TEST_TOP, Math.max(QUICK_TEST_TOP, rows.length - QUICK_TEST_BOTTOM));
  middlePool.sort((a, b) => Math.abs(a.beta) - Math.abs(b.beta));
  const middle = middlePool.slice(0, QUICK_TEST_MIDDLE);

  // Deduplicate (in case the article count is small enough that top/bottom/middle overlap)
  const ids = new Set<string>();
  for (const r of [...top, ...middle, ...bottom]) ids.add(r.article_id);
  return [...ids];
}

export async function scoreArticlesWithPrompt(
  db: Db,
  promptId: string,
  mode: ScoringMode,
  modelOverride?: string,
): Promise<ScoringSummary> {
  const start = Date.now();

  const { data: prompt } = await db
    .from("lab_value_prompts")
    .select("id, module_id, version, prompt_text, quick_tested_at")
    .eq("id", promptId)
    .maybeSingle();
  if (!prompt) throw new Error("Prompt not found");

  type Prompt = { id: string; module_id: string; version: number; prompt_text: string; quick_tested_at: string | null };
  const p = prompt as Prompt;

  // Determine which articles to score
  let articleIds: string[];
  if (mode === "quick") {
    articleIds = await selectQuickArticleIds(db, p.module_id);
  } else if (mode === "disagreements") {
    articleIds = await selectDisagreementArticleIds(db, p.id);
  } else {
    // full: every article in the module that hasn't been scored by this prompt yet
    const { data: allArts } = await db
      .from("lab_value_articles")
      .select("id")
      .eq("module_id", p.module_id);
    type IdRow = { id: string };
    const allIds = ((allArts ?? []) as IdRow[]).map(r => r.id);

    const { data: existing } = await db
      .from("lab_value_article_scores")
      .select("article_id")
      .eq("prompt_id", p.id);
    type ScoredRow = { article_id: string };
    const scored = new Set(((existing ?? []) as ScoredRow[]).map(r => r.article_id));

    articleIds = allIds.filter(id => !scored.has(id));
  }

  if (articleIds.length === 0) {
    return { total: 0, succeeded: 0, failed: 0, durationMs: Date.now() - start, promptVersion: p.version };
  }

  // Fetch full article rows for selected ids
  const { data: articles } = await db
    .from("lab_value_articles")
    .select("id, title, journal, article_type, short_headline, resume, bottom_line, sari")
    .in("id", articleIds);

  const arts = (articles ?? []) as ScoringArticle[];

  const effectiveModel = modelOverride ?? SCORING_MODEL;
  const modelKey = `value_scoring_craft_v${p.version}_${mode}`;
  const task = `value_scoring_craft_${mode}`;

  const results = await runInChunks(arts, SCORING_CONCURRENCY, async (article) => {
    try {
      const params = buildScoringRequest(article, p.prompt_text, effectiveModel);
      const message = await trackedCall(modelKey, params, article.id, task);
      const raw = (message.content[0] as { type: string; text: string }).text.trim();
      const { score, reasoning } = parseScoringResponse(raw);
      return {
        article_id:   article.id,
        score,
        reasoning,
        raw_response: { text: raw, usage: message.usage },
      };
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      return {
        article_id:   article.id,
        score:        null,
        reasoning:    null,
        raw_response: { error: errMessage },
      };
    }
  });

  const now = new Date().toISOString();
  const rows = results.map(r => ({
    module_id:     p.module_id,
    prompt_id:     p.id,
    article_id:    r.article_id,
    score:         r.score,
    reasoning:     r.reasoning,
    raw_response:  r.raw_response,
    scoring_model: effectiveModel,
    scored_at:     now,
  }));

  const UPSERT_CHUNK = 100;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await db
      .from("lab_value_article_scores")
      .upsert(chunk, { onConflict: "prompt_id,article_id" });
    if (error) throw new Error(`Failed to upsert scores: ${error.message}`);
  }

  if (mode === "quick" && p.quick_tested_at === null) {
    const { error: markErr } = await db
      .from("lab_value_prompts")
      .update({ quick_tested_at: now })
      .eq("id", p.id);
    if (markErr) throw new Error(`Failed to mark quick_tested_at: ${markErr.message}`);
  }

  const succeeded = results.filter(r => r.score !== null).length;
  return {
    total:         results.length,
    succeeded,
    failed:        results.length - succeeded,
    durationMs:    Date.now() - start,
    promptVersion: p.version,
  };
}
