// Helpers for the prompt phase of the Craft value-scoring module.
//
// A "prompt version" is a row in lab_value_prompts identified by (module_id, version).
// Versions are immutable once any scores have been recorded for them in
// lab_value_article_scores — to change the prompt, create a new version.

import { QUICK_TEST_TOTAL } from "./craft-config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type PromptStatus = "draft" | "quick_tested" | "scoring" | "scored";

export interface PromptVersionRow {
  id:                string;
  version:           number;
  created_at:        string;
  change_notes:      string | null;
  scoredCount:       number;
  articleCount:      number;
  quick_tested_at:   string | null;
  parent_prompt_id:  string | null;
  status:            PromptStatus;
  lastScoredAt:      string | null;
}

export interface PromptVersionDetail extends PromptVersionRow {
  prompt_text: string;
  editable:    boolean;
}

export interface ScoreDistribution {
  count:  number;
  failed: number;
  min:    number | null;
  max:    number | null;
  mean:   number | null;
  median: number | null;
}

function deriveStatus(
  effectiveCount: number,
  articleCount:   number,
  quickTestedAt:  string | null,
  ownCount:       number,
): PromptStatus {
  if (ownCount === 0) return "draft";
  // A version is considered "scored" when every article has an effective
  // score (own or inherited from a parent chain).
  if (effectiveCount >= articleCount) return "scored";
  // Quick test marker: own count is the quick batch size and we set quick_tested_at.
  if (quickTestedAt !== null && ownCount === QUICK_TEST_TOTAL) return "quick_tested";
  return "scoring";
}

export async function getModuleArticleCount(db: Db, moduleId: string): Promise<number> {
  const { count } = await db
    .from("lab_value_articles")
    .select("id", { count: "exact", head: true })
    .eq("module_id", moduleId);
  return count ?? 0;
}

export async function getDecidedPairCount(db: Db, moduleId: string): Promise<number> {
  const { count } = await db
    .from("lab_value_pairs")
    .select("id", { count: "exact", head: true })
    .eq("module_id", moduleId)
    .not("winner_id", "is", null);
  return count ?? 0;
}

export async function getPromptVersions(db: Db, moduleId: string): Promise<PromptVersionRow[]> {
  const { data: prompts } = await db
    .from("lab_value_prompts")
    .select("id, version, created_at, change_notes, quick_tested_at, parent_prompt_id")
    .eq("module_id", moduleId)
    .order("version", { ascending: false });

  type PromptRow = {
    id: string; version: number; created_at: string;
    change_notes: string | null; quick_tested_at: string | null;
    parent_prompt_id: string | null;
  };
  const rows = (prompts ?? []) as PromptRow[];
  if (rows.length === 0) return [];

  const articleCount = await getModuleArticleCount(db, moduleId);

  // Pull all scores for these prompts in one query — gives us both the count
  // and the latest scored_at per prompt without a second roundtrip.
  const promptIds = rows.map(r => r.id);
  const { data: scoreRows } = await db
    .from("lab_value_article_scores")
    .select("prompt_id, scored_at")
    .in("prompt_id", promptIds);

  type ScoreCountRow = { prompt_id: string; scored_at: string };
  const counts = new Map<string, number>();
  const lastScored = new Map<string, string>();
  for (const s of (scoreRows ?? []) as ScoreCountRow[]) {
    counts.set(s.prompt_id, (counts.get(s.prompt_id) ?? 0) + 1);
    const prev = lastScored.get(s.prompt_id);
    if (!prev || s.scored_at > prev) lastScored.set(s.prompt_id, s.scored_at);
  }

  // Build parent map so we can compute the effective scored count by walking
  // the parent chain — v_n inherits scores from v_(n-1) for articles it didn't
  // re-score itself.
  const parentOf = new Map<string, string | null>(rows.map(r => [r.id, r.parent_prompt_id]));
  const scoredArticleIds = new Map<string, Set<string>>();
  if (scoreRows && (scoreRows as { prompt_id: string }[]).length > 0) {
    const { data: detailedRows } = await db
      .from("lab_value_article_scores")
      .select("prompt_id, article_id")
      .in("prompt_id", promptIds);
    type DRow = { prompt_id: string; article_id: string };
    for (const r of (detailedRows ?? []) as DRow[]) {
      let set = scoredArticleIds.get(r.prompt_id);
      if (!set) { set = new Set(); scoredArticleIds.set(r.prompt_id, set); }
      set.add(r.article_id);
    }
  }
  function effectiveCount(promptId: string): number {
    const seen = new Set<string>();
    let current: string | null | undefined = promptId;
    while (current) {
      const set = scoredArticleIds.get(current);
      if (set) for (const id of set) seen.add(id);
      current = parentOf.get(current) ?? null;
    }
    return seen.size;
  }

  return rows.map(r => {
    const scoredCount = counts.get(r.id) ?? 0;
    const effective   = effectiveCount(r.id);
    return {
      id:               r.id,
      version:          r.version,
      created_at:       r.created_at,
      change_notes:     r.change_notes,
      quick_tested_at:  r.quick_tested_at,
      parent_prompt_id: r.parent_prompt_id,
      scoredCount,
      articleCount,
      lastScoredAt:     lastScored.get(r.id) ?? null,
      status:           deriveStatus(effective, articleCount, r.quick_tested_at, scoredCount),
    };
  });
}

export async function getPromptVersion(db: Db, promptId: string): Promise<PromptVersionDetail | null> {
  const { data: prompt } = await db
    .from("lab_value_prompts")
    .select("id, module_id, version, prompt_text, change_notes, created_at, quick_tested_at, parent_prompt_id")
    .eq("id", promptId)
    .maybeSingle();

  if (!prompt) return null;

  type P = {
    id: string; module_id: string; version: number; prompt_text: string;
    change_notes: string | null; created_at: string;
    quick_tested_at: string | null; parent_prompt_id: string | null;
  };
  const p = prompt as P;

  // Use the module-wide listing for parent-chain walk so we don't duplicate logic.
  const versions = await getPromptVersions(db, p.module_id);
  const row = versions.find(v => v.id === p.id);
  if (!row) {
    // Shouldn't happen — the prompt exists but isn't in its module's listing.
    return null;
  }

  return {
    ...row,
    prompt_text: p.prompt_text,
    editable:    row.scoredCount === 0,
  };
}

export async function createPromptVersion(
  db: Db,
  moduleId: string,
  promptText: string,
  changeNotes: string | null,
  parentPromptId: string | null = null,
  directionId: string | null = null,
): Promise<{ id: string; version: number }> {
  // Version counter is scoped to the direction (or module-wide if no direction).
  let versionQuery = db
    .from("lab_value_prompts")
    .select("version")
    .eq("module_id", moduleId)
    .order("version", { ascending: false })
    .limit(1);
  if (directionId) versionQuery = versionQuery.eq("direction_id", directionId);

  const { data: latest } = await versionQuery;
  type V = { version: number };
  const latestRows = (latest ?? []) as V[];
  const nextVersion = latestRows.length > 0 ? latestRows[0].version + 1 : 1;

  // Only keep parent if it lives in the same direction — prevents a new
  // direction's first experiment from inheriting an unrelated iteration chain.
  let resolvedParent = parentPromptId;
  if (resolvedParent && directionId) {
    const { data: parentRow } = await db
      .from("lab_value_prompts")
      .select("direction_id")
      .eq("id", resolvedParent)
      .maybeSingle();
    const parentDir = (parentRow as { direction_id: string | null } | null)?.direction_id ?? null;
    if (parentDir !== directionId) resolvedParent = null;
  }

  const { data: inserted, error } = await db
    .from("lab_value_prompts")
    .insert({
      module_id:        moduleId,
      version:          nextVersion,
      prompt_text:      promptText,
      change_notes:     changeNotes && changeNotes.trim().length > 0 ? changeNotes.trim() : null,
      parent_prompt_id: resolvedParent,
      direction_id:     directionId,
    })
    .select("id, version")
    .single();

  if (error) throw new Error(`Failed to create prompt version: ${error.message}`);
  return { id: (inserted as { id: string }).id, version: (inserted as { version: number }).version };
}

export async function updatePromptVersion(
  db: Db,
  promptId: string,
  promptText: string,
  changeNotes: string | null,
): Promise<void> {
  // Refuse if any scores already exist for this prompt
  const { count: scoredCount } = await db
    .from("lab_value_article_scores")
    .select("id", { count: "exact", head: true })
    .eq("prompt_id", promptId);
  if ((scoredCount ?? 0) > 0) {
    throw new Error("Prompt has been scored — create a new version to make changes");
  }

  const { error } = await db
    .from("lab_value_prompts")
    .update({
      prompt_text:  promptText,
      change_notes: changeNotes && changeNotes.trim().length > 0 ? changeNotes.trim() : null,
    })
    .eq("id", promptId);
  if (error) throw new Error(`Failed to update prompt version: ${error.message}`);
}

export interface QuickResultRow {
  article_id:       string;
  title:            string;
  article_type:     string | null;
  normalizedScore:  number | null; // BT normalized 1-10 score
  score:            number | null; // prompt score (1-10, legacy/derived)
  craftScore:       number | null; // rubric craft_score (20-100), null for legacy prompts
  reasoning:        string | null; // prompt reasoning text
  scoring_model:    string | null; // model that produced the score
  scored_at:        string | null; // ISO timestamp
}

/**
 * Loads the rows that should appear in the quick-test result table on the
 * prompt detail page: every article that has both a β value (Bradley-Terry)
 * and a prompt score for the given prompt, sorted by β descending.
 */
export async function getQuickResults(db: Db, promptId: string): Promise<QuickResultRow[]> {
  const { data: prompt } = await db
    .from("lab_value_prompts")
    .select("module_id")
    .eq("id", promptId)
    .maybeSingle();
  if (!prompt) return [];
  const moduleId = (prompt as { module_id: string }).module_id;

  const { data: scores } = await db
    .from("lab_value_article_scores")
    .select("article_id, score, craft_score, reasoning, scoring_model, scored_at")
    .eq("prompt_id", promptId);
  type S = { article_id: string; score: number | string | null; craft_score: number | string | null; reasoning: string | null; scoring_model: string | null; scored_at: string | null };
  const scoreMap      = new Map<string, number | null>();
  const craftScoreMap = new Map<string, number | null>();
  const reasoningMap  = new Map<string, string | null>();
  const modelMap      = new Map<string, string | null>();
  const scoredAtMap   = new Map<string, string | null>();
  for (const s of (scores ?? []) as S[]) {
    const n = s.score === null ? null : Number(s.score);
    scoreMap.set(s.article_id, n !== null && Number.isFinite(n) ? n : null);
    const c = s.craft_score === null ? null : Number(s.craft_score);
    craftScoreMap.set(s.article_id, c !== null && Number.isFinite(c) ? c : null);
    reasoningMap.set(s.article_id, s.reasoning ?? null);
    modelMap.set(s.article_id, s.scoring_model ?? null);
    scoredAtMap.set(s.article_id, s.scored_at ?? null);
  }
  if (scoreMap.size === 0) return [];

  const articleIds = [...scoreMap.keys()];

  const [{ data: arts }, { data: rankings }] = await Promise.all([
    db.from("lab_value_articles").select("id, title, article_type").in("id", articleIds),
    db.from("lab_value_rankings").select("article_id, normalized_score").eq("module_id", moduleId),
  ]);

  type ArtRow = { id: string; title: string; article_type: string | null };
  const artMap = new Map<string, ArtRow>();
  for (const a of (arts ?? []) as ArtRow[]) artMap.set(a.id, a);

  type RankRow = { article_id: string; normalized_score: number | string | null };
  const normalizedMap = new Map<string, number | null>();
  for (const r of (rankings ?? []) as RankRow[]) {
    normalizedMap.set(r.article_id, r.normalized_score !== null ? Number(r.normalized_score) : null);
  }

  const rows: QuickResultRow[] = [];
  for (const [articleId, score] of scoreMap) {
    const art = artMap.get(articleId);
    if (!art) continue;
    rows.push({
      article_id:      articleId,
      title:           art.title,
      article_type:    art.article_type,
      normalizedScore: normalizedMap.get(articleId) ?? null,
      score,
      craftScore:      craftScoreMap.get(articleId) ?? null,
      reasoning:       reasoningMap.get(articleId) ?? null,
      scoring_model:   modelMap.get(articleId) ?? null,
      scored_at:       scoredAtMap.get(articleId) ?? null,
    });
  }

  // Sort by BT normalized score descending; articles without a ranking go last
  rows.sort((a, b) => (b.normalizedScore ?? -Infinity) - (a.normalizedScore ?? -Infinity));
  return rows;
}

export async function getScoreDistribution(db: Db, promptId: string): Promise<ScoreDistribution> {
  const { data: rows } = await db
    .from("lab_value_article_scores")
    .select("score")
    .eq("prompt_id", promptId);

  type R = { score: number | string | null };
  const all = ((rows ?? []) as R[]).map(r => r.score);
  const numeric = all
    .filter((s): s is number | string => s !== null && s !== undefined)
    .map(s => Number(s))
    .filter(n => Number.isFinite(n));

  const failed = all.length - numeric.length;
  if (numeric.length === 0) {
    return { count: 0, failed, min: null, max: null, mean: null, median: null };
  }

  numeric.sort((a, b) => a - b);
  const min = numeric[0];
  const max = numeric[numeric.length - 1];
  const mean = numeric.reduce((s, n) => s + n, 0) / numeric.length;
  const mid = Math.floor(numeric.length / 2);
  const median = numeric.length % 2 === 0
    ? (numeric[mid - 1] + numeric[mid]) / 2
    : numeric[mid];

  return { count: numeric.length, failed, min, max, mean, median };
}
