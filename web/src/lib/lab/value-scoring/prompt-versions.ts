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
  id:               string;
  version:          number;
  created_at:       string;
  change_notes:     string | null;
  scoredCount:      number;
  articleCount:     number;
  quick_tested_at:  string | null;
  status:           PromptStatus;
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

function deriveStatus(scoredCount: number, articleCount: number, quickTestedAt: string | null): PromptStatus {
  if (scoredCount === 0) return "draft";
  if (scoredCount >= articleCount) return "scored";
  // Quick test specifically scored QUICK_TEST_TOTAL articles AND we marked quick_tested_at
  if (quickTestedAt !== null && scoredCount === QUICK_TEST_TOTAL) return "quick_tested";
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
    .select("id, version, created_at, change_notes, quick_tested_at")
    .eq("module_id", moduleId)
    .order("version", { ascending: false });

  type PromptRow = { id: string; version: number; created_at: string; change_notes: string | null; quick_tested_at: string | null };
  const rows = (prompts ?? []) as PromptRow[];
  if (rows.length === 0) return [];

  const articleCount = await getModuleArticleCount(db, moduleId);

  // Count scored rows per prompt in a single query
  const promptIds = rows.map(r => r.id);
  const { data: scoreRows } = await db
    .from("lab_value_article_scores")
    .select("prompt_id")
    .in("prompt_id", promptIds);

  type ScoreCountRow = { prompt_id: string };
  const counts = new Map<string, number>();
  for (const s of (scoreRows ?? []) as ScoreCountRow[]) {
    counts.set(s.prompt_id, (counts.get(s.prompt_id) ?? 0) + 1);
  }

  return rows.map(r => {
    const scoredCount = counts.get(r.id) ?? 0;
    return {
      id:              r.id,
      version:         r.version,
      created_at:      r.created_at,
      change_notes:    r.change_notes,
      quick_tested_at: r.quick_tested_at,
      scoredCount,
      articleCount,
      status:          deriveStatus(scoredCount, articleCount, r.quick_tested_at),
    };
  });
}

export async function getPromptVersion(db: Db, promptId: string): Promise<PromptVersionDetail | null> {
  const { data: prompt } = await db
    .from("lab_value_prompts")
    .select("id, module_id, version, prompt_text, change_notes, created_at, quick_tested_at")
    .eq("id", promptId)
    .maybeSingle();

  if (!prompt) return null;

  type P = { id: string; module_id: string; version: number; prompt_text: string; change_notes: string | null; created_at: string; quick_tested_at: string | null };
  const p = prompt as P;

  const articleCount = await getModuleArticleCount(db, p.module_id);
  const { count: scoredCount } = await db
    .from("lab_value_article_scores")
    .select("id", { count: "exact", head: true })
    .eq("prompt_id", p.id);

  const sc = scoredCount ?? 0;
  return {
    id:              p.id,
    version:         p.version,
    created_at:      p.created_at,
    change_notes:    p.change_notes,
    prompt_text:     p.prompt_text,
    quick_tested_at: p.quick_tested_at,
    scoredCount:     sc,
    articleCount,
    status:          deriveStatus(sc, articleCount, p.quick_tested_at),
    editable:        sc === 0,
  };
}

export async function createPromptVersion(
  db: Db,
  moduleId: string,
  promptText: string,
  changeNotes: string | null,
): Promise<{ id: string; version: number }> {
  // Auto-increment version per module
  const { data: latest } = await db
    .from("lab_value_prompts")
    .select("version")
    .eq("module_id", moduleId)
    .order("version", { ascending: false })
    .limit(1);

  type V = { version: number };
  const latestRows = (latest ?? []) as V[];
  const nextVersion = latestRows.length > 0 ? latestRows[0].version + 1 : 1;

  const { data: inserted, error } = await db
    .from("lab_value_prompts")
    .insert({
      module_id:    moduleId,
      version:      nextVersion,
      prompt_text:  promptText,
      change_notes: changeNotes && changeNotes.trim().length > 0 ? changeNotes.trim() : null,
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
  article_id:   string;
  title:        string;
  article_type: string | null;
  beta:         number;
  score:        number | null;
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
    .select("article_id, score")
    .eq("prompt_id", promptId);
  type S = { article_id: string; score: number | string | null };
  const scoreMap = new Map<string, number | null>();
  for (const s of (scores ?? []) as S[]) {
    const n = s.score === null ? null : Number(s.score);
    scoreMap.set(s.article_id, n !== null && Number.isFinite(n) ? n : null);
  }
  if (scoreMap.size === 0) return [];

  const articleIds = [...scoreMap.keys()];

  const [{ data: arts }, { data: rankings }] = await Promise.all([
    db.from("lab_value_articles").select("id, title, article_type").in("id", articleIds),
    db.from("lab_value_rankings").select("article_id, beta_score").eq("module_id", moduleId),
  ]);

  type ArtRow = { id: string; title: string; article_type: string | null };
  const artMap = new Map<string, ArtRow>();
  for (const a of (arts ?? []) as ArtRow[]) artMap.set(a.id, a);

  type RankRow = { article_id: string; beta_score: number | string };
  const betaMap = new Map<string, number>();
  for (const r of (rankings ?? []) as RankRow[]) betaMap.set(r.article_id, Number(r.beta_score));

  const rows: QuickResultRow[] = [];
  for (const [articleId, score] of scoreMap) {
    const art = artMap.get(articleId);
    const beta = betaMap.get(articleId);
    if (!art || beta === undefined) continue;
    rows.push({
      article_id:   articleId,
      title:        art.title,
      article_type: art.article_type,
      beta,
      score,
    });
  }

  rows.sort((a, b) => b.beta - a.beta);
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
