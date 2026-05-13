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
  id:           string;
  title:        string;
  journal:      string | null;
  article_type: string | null;
  abstract:     string | null;
}

export type DimensionStatus = "scored" | "neutral" | "not_applicable";

export interface DimensionEntry {
  score:         number | null;
  status: DimensionStatus;
}

// Rich per-dimension structure. Old format (plain number | null) is converted
// during parsing so downstream code always sees DimensionEntry.
export type DimensionScores = Record<string, DimensionEntry | null>;

// Rubric weights per dimension (sum = 100).
// Used to normalise craft_score when some dimensions are null.
export const DIMENSION_WEIGHTS: Record<string, number> = {
  bias:                   20,
  statistical_analyses:   15,
  study_design:           15,
  outcome_quality:        10,
  sample_size:            10,
  intervention_integrity: 10,
  protocol_adherence:      5,
  consistency:             5,
  generalizability:        5,
  reproducibility:         5,
};

// Minimum total weight required to produce a meaningful craft_score.
const MIN_WEIGHT_THRESHOLD = 30;

/**
 * Compute normalised craft_score (10-100) from the rubric dimensions.
 * Null dimensions (not applicable) are excluded; the remaining weights are
 * scaled to 100 so the result stays on the 10-100 scale.
 *
 * formula: craft = sum(score × weight / 10) × (100 / sumWeights)
 * returns null when no dimensions were scored or total weight < threshold.
 */
export function computeCraftScore(dimensions: DimensionScores): number | null {
  let sumContributions = 0;
  let sumWeights = 0;
  for (const [key, entry] of Object.entries(dimensions)) {
    if (!entry || entry.status === "not_applicable" || entry.score === null) continue;
    const w = DIMENSION_WEIGHTS[key] ?? 0;
    sumContributions += (entry.score * w) / 10;
    sumWeights += w;
  }
  if (sumWeights === 0) return null;
  if (sumWeights < MIN_WEIGHT_THRESHOLD) {
    console.warn(`[computeCraftScore] Only ${sumWeights} weight units scored — article may be outside rubric domain`);
  }
  return sumContributions * (100 / sumWeights);
}

export interface ParsedScore {
  score:      number | null; // 1-10 (derived from craft_score when present, else read directly)
  craftScore: number | null; // 20-100 from rubric prompt; null for legacy prompts
  dimensions: DimensionScores | null; // per-dimension 1-5 scores; null for legacy or parse failure
  reasoning:  string | null;
}

// craft_score (10-100) → score (1-10), rounded to integer.
export function craftScoreToScore(craft: number): number {
  return Math.round((craft - 10) / 90 * 9 + 1);
}

export interface ScoringSummary {
  total:        number;
  succeeded:    number;
  failed:       number;
  durationMs:   number;
  promptVersion: number;
}

const MIN_ABSTRACT_LENGTH = 100;

function fmtField(label: string, value: string | null | undefined): string {
  return `${label}: ${value && value.trim().length > 0 ? value.trim() : "—"}`;
}

export function buildUserMessage(article: ScoringArticle): string {
  const abstract = article.abstract?.trim() ?? "";
  const lines = [
    fmtField("Title",        article.title),
    fmtField("Article type", article.article_type),
    fmtField("Journal",      article.journal),
    "",
  ];
  if (abstract.length >= MIN_ABSTRACT_LENGTH) {
    lines.push("Abstract:");
    lines.push(abstract);
  } else {
    lines.push("Abstract: NOT AVAILABLE — score based on metadata alone. Return null for dimensions that cannot be assessed without the abstract.");
  }
  return lines.join("\n");
}

export function buildScoringRequest(article: ScoringArticle, promptText: string, modelOverride?: string) {
  return {
    model:      modelOverride ?? SCORING_MODEL,
    max_tokens: SCORING_MAX_TOKENS,
    thinking:   { type: "disabled" as const },
    system: [
      promptText,
      "",
      "Respond only with valid JSON, no other text and no markdown fences.",
      "Output format: {\"craft_score\": <number 10-100>, \"dimensions\": {\"<dim>\": {\"score\": <1-10 or null>, \"status\": <\"scored\"|\"neutral\"|\"not_applicable\">}, ...}, \"reasoning\": <string>}",
    ].join("\n"),
    messages: [{ role: "user" as const, content: buildUserMessage(article) }],
  };
}

function readNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim().length > 0) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

const VALID_STATUS = new Set<DimensionStatus>(["scored", "neutral", "not_applicable"]);

function parseStatus(raw: unknown): DimensionStatus {
  return VALID_STATUS.has(raw as DimensionStatus)
    ? (raw as DimensionStatus)
    : "scored";
}

function parseDimensions(raw: unknown): DimensionScores | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const result: DimensionScores = {};
  let hasAny = false;
  for (const [key, val] of Object.entries(obj)) {
    if (val === null) {
      // Old format: null → not_applicable
      result[key] = { score: null, status: "not_applicable" };
      hasAny = true;
    } else if (typeof val === "object" && !Array.isArray(val)) {
      // New format: { score, status }
      const e = val as { score?: unknown; status?: unknown };
      const score = e.score === null ? null : readNumber(e.score);
      result[key] = { score, status: parseStatus(e.status) };
      hasAny = true;
    } else {
      // Old format: plain number → scored
      const n = readNumber(val);
      if (n !== null) { result[key] = { score: n, status: "scored" }; hasAny = true; }
    }
  }
  return hasAny ? result : null;
}

export function parseScoringResponse(rawText: string): ParsedScore {
  try {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) return { score: null, craftScore: null, dimensions: null, reasoning: null };
    const parsed = JSON.parse(match[0]) as { score?: unknown; craft_score?: unknown; dimensions?: unknown; reasoning?: unknown };

    const dimensions = parseDimensions(parsed.dimensions);

    // If dimensions are present, compute craft_score from them using the
    // normalised formula (null dims excluded, weights re-scaled to 100).
    // This is authoritative when some dimensions are null.
    // If no dimensions (legacy prompt), fall back to reported craft_score or score.
    let craftScore: number | null = null;
    if (dimensions !== null) {
      craftScore = computeCraftScore(dimensions);
    }
    if (craftScore === null) {
      craftScore = readNumber(parsed.craft_score);
    }

    const directScore = readNumber(parsed.score);
    let score: number | null = null;
    if (craftScore !== null) score = craftScoreToScore(craftScore);
    else if (directScore !== null) score = directScore;

    const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : null;
    return { score, craftScore, dimensions, reasoning };
  } catch {
    return { score: null, craftScore: null, dimensions: null, reasoning: null };
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
      .select("article_id, score, craft_score")
      .eq("prompt_id", p.parent_prompt_id)
      .not("score", "is", null),
    db.from("lab_value_pairs")
      .select("article_a_id, article_b_id, winner_id")
      .eq("module_id", p.module_id)
      .not("winner_id", "is", null),
  ]);

  type ScoreRow = { article_id: string; score: number | string; craft_score: number | string | null };
  const scoreMap = new Map<string, number>();
  for (const r of (scores ?? []) as ScoreRow[]) {
    // Prefer craft_score (20-100) when present; comparison only cares about order.
    const craft = r.craft_score !== null ? Number(r.craft_score) : NaN;
    const fallback = Number(r.score);
    const v = Number.isFinite(craft) ? craft : Number.isFinite(fallback) ? fallback : null;
    if (v !== null) scoreMap.set(r.article_id, v);
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

  // Fetch scoring fields — title/article_type/journal/abstract only.
  const { data: articles } = await db
    .from("lab_value_articles")
    .select("id, title, journal, article_type, abstract")
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
      const { score, craftScore, dimensions, reasoning } = parseScoringResponse(raw);
      return {
        article_id:   article.id,
        score,
        craftScore,
        dimensions,
        reasoning,
        raw_response: { text: raw, usage: message.usage },
      };
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      return {
        article_id:   article.id,
        score:        null,
        craftScore:   null,
        dimensions:   null,
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
    craft_score:   r.craftScore,
    dimensions:    r.dimensions,
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
