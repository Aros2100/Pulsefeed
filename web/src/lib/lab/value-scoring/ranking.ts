// Server-side Bradley-Terry ranking for a value-scoring module.
// Reads decided pairs from lab_value_pairs, runs the BT estimator,
// and upserts (module_id, article_id, β, pair_count) into lab_value_rankings.

import { computeBradleyTerry } from "./bradley-terry";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface ComputeSummary {
  articleCount: number;
  decidedPairs: number;
  iterations: number;
  converged: boolean;
  durationMs: number;
  betaMin: number;
  betaMax: number;
}

export async function computeAndStoreBradleyTerry(db: Db, moduleId: string): Promise<ComputeSummary> {
  const start = Date.now();

  const { data: articles, error: artErr } = await db
    .from("lab_value_articles")
    .select("id")
    .eq("module_id", moduleId);
  if (artErr) throw new Error(`Failed to load articles: ${artErr.message}`);

  type ArticleRow = { id: string };
  const articleIds = (articles ?? []).map((r: ArticleRow) => r.id) as string[];

  const { data: pairs, error: pairErr } = await db
    .from("lab_value_pairs")
    .select("article_a_id, article_b_id, winner_id")
    .eq("module_id", moduleId)
    .not("winner_id", "is", null);
  if (pairErr) throw new Error(`Failed to load pairs: ${pairErr.message}`);

  type PairRow = { article_a_id: string; article_b_id: string; winner_id: string };
  const decided = (pairs ?? []) as PairRow[];

  const btPairs = decided.map(p => ({
    winnerId: p.winner_id,
    loserId:  p.winner_id === p.article_a_id ? p.article_b_id : p.article_a_id,
  }));

  // Pair counts per article (used for the pair_count column)
  const pairCount = new Map<string, number>(articleIds.map(id => [id, 0]));
  for (const p of decided) {
    pairCount.set(p.article_a_id, (pairCount.get(p.article_a_id) ?? 0) + 1);
    pairCount.set(p.article_b_id, (pairCount.get(p.article_b_id) ?? 0) + 1);
  }

  const { betas, iterations, converged } = computeBradleyTerry(articleIds, btPairs);

  const now = new Date().toISOString();
  const rows = articleIds.map(id => ({
    module_id:   moduleId,
    article_id:  id,
    beta_score:  betas.get(id) ?? 0,
    pair_count:  pairCount.get(id) ?? 0,
    computed_at: now,
  }));

  if (rows.length > 0) {
    const { error: upErr } = await db
      .from("lab_value_rankings")
      .upsert(rows, { onConflict: "module_id,article_id" });
    if (upErr) throw new Error(`Failed to upsert rankings: ${upErr.message}`);
  }

  let betaMin = 0;
  let betaMax = 0;
  if (rows.length > 0) {
    betaMin = Infinity;
    betaMax = -Infinity;
    for (const r of rows) {
      if (r.beta_score < betaMin) betaMin = r.beta_score;
      if (r.beta_score > betaMax) betaMax = r.beta_score;
    }
  }

  return {
    articleCount: articleIds.length,
    decidedPairs: decided.length,
    iterations,
    converged,
    durationMs:   Date.now() - start,
    betaMin,
    betaMax,
  };
}
