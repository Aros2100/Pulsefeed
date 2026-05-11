// Evaluation helpers for a prompt version: pair-match against the human
// pairwise choices, Spearman correlation against the Bradley-Terry ranking,
// and a list of disagreements (with reason categories and notes) intended as
// the raw material for iterating on the next prompt.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface PairMatchResult {
  totalPairs:   number;  // decided pairs where both articles have a prompt score
  matches:      number;
  mismatches:   number;
  ties:         number;  // prompt scored both articles equally
  matchPercent: number;  // matches / totalPairs * 100, or 0 if totalPairs == 0
}

export interface RankingCorrelationResult {
  rho: number;   // Spearman ρ, NaN→0
  n:   number;   // number of articles with both β and prompt score
}

export interface DisagreementRow {
  pairId:         string;
  humanChoiceId:  string;
  promptChoiceId: string | null; // null when the prompt tied
  scoreA:         number | null;
  scoreB:         number | null;
  scoreDiff:      number;
  betaA:          number | null;
  betaB:          number | null;
  betaDiff:       number;
  articleA:       { id: string; title: string; article_type: string | null };
  articleB:       { id: string; title: string; article_type: string | null };
  reasons:        string[];
  notes:          string | null;
}

// ── Statistics ───────────────────────────────────────────────────────────────

function rankWithTies(values: number[]): number[] {
  const n = values.length;
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && indexed[j + 1].v === indexed[i].v) j++;
    const avg = (i + j) / 2 + 1; // average 1-indexed rank for the tied group
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = avg;
    i = j + 1;
  }
  return ranks;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const denom = Math.sqrt(sxx * syy);
  return denom === 0 ? 0 : sxy / denom;
}

export function spearman(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  return pearson(rankWithTies(xs), rankWithTies(ys));
}

// ── DB-backed evaluation ────────────────────────────────────────────────────

async function loadModuleId(db: Db, promptId: string): Promise<string> {
  const { data: prompt } = await db
    .from("lab_value_prompts")
    .select("module_id")
    .eq("id", promptId)
    .maybeSingle();
  if (!prompt) throw new Error("Prompt not found");
  return (prompt as { module_id: string }).module_id;
}

async function loadScoreMap(db: Db, promptId: string): Promise<Map<string, number>> {
  const { data: scores } = await db
    .from("lab_value_article_scores")
    .select("article_id, score")
    .eq("prompt_id", promptId)
    .not("score", "is", null);

  type R = { article_id: string; score: number | string };
  const map = new Map<string, number>();
  for (const r of (scores ?? []) as R[]) {
    const n = Number(r.score);
    if (Number.isFinite(n)) map.set(r.article_id, n);
  }
  return map;
}

async function loadBetaMap(db: Db, moduleId: string): Promise<Map<string, number>> {
  const { data: rankings } = await db
    .from("lab_value_rankings")
    .select("article_id, beta_score")
    .eq("module_id", moduleId);

  type R = { article_id: string; beta_score: number | string };
  const map = new Map<string, number>();
  for (const r of (rankings ?? []) as R[]) {
    map.set(r.article_id, Number(r.beta_score));
  }
  return map;
}

export async function computePairMatch(db: Db, promptId: string): Promise<PairMatchResult> {
  const moduleId = await loadModuleId(db, promptId);

  const { data: pairs } = await db
    .from("lab_value_pairs")
    .select("article_a_id, article_b_id, winner_id")
    .eq("module_id", moduleId)
    .not("winner_id", "is", null);

  type Pair = { article_a_id: string; article_b_id: string; winner_id: string };
  const decided = (pairs ?? []) as Pair[];

  const scoreMap = await loadScoreMap(db, promptId);

  let total = 0;
  let matches = 0;
  let mismatches = 0;
  let ties = 0;
  for (const p of decided) {
    const sa = scoreMap.get(p.article_a_id);
    const sb = scoreMap.get(p.article_b_id);
    if (sa === undefined || sb === undefined) continue; // can't evaluate
    total++;
    if (sa === sb) {
      ties++;
      continue;
    }
    const promptChoice = sa > sb ? p.article_a_id : p.article_b_id;
    if (promptChoice === p.winner_id) matches++;
    else mismatches++;
  }

  return {
    totalPairs:   total,
    matches,
    mismatches,
    ties,
    matchPercent: total === 0 ? 0 : (matches / total) * 100,
  };
}

export async function computeRankingCorrelation(db: Db, promptId: string): Promise<RankingCorrelationResult> {
  const moduleId = await loadModuleId(db, promptId);
  const betaMap  = await loadBetaMap(db, moduleId);
  const scoreMap = await loadScoreMap(db, promptId);

  const xs: number[] = [];
  const ys: number[] = [];
  for (const [articleId, beta] of betaMap) {
    const s = scoreMap.get(articleId);
    if (s === undefined) continue;
    xs.push(beta);
    ys.push(s);
  }

  return { rho: spearman(xs, ys), n: xs.length };
}

export async function getDisagreements(
  db: Db,
  promptId: string,
  options?: { includeTies?: boolean; minScoreDiff?: number },
): Promise<DisagreementRow[]> {
  const includeTies  = options?.includeTies  ?? false;
  const minScoreDiff = options?.minScoreDiff ?? 0;

  const moduleId = await loadModuleId(db, promptId);
  const scoreMap = await loadScoreMap(db, promptId);
  const betaMap  = await loadBetaMap(db, moduleId);

  const { data: pairs } = await db
    .from("lab_value_pairs")
    .select("id, article_a_id, article_b_id, winner_id")
    .eq("module_id", moduleId)
    .not("winner_id", "is", null);

  type Pair = { id: string; article_a_id: string; article_b_id: string; winner_id: string };
  const decided = (pairs ?? []) as Pair[];

  // First pass: classify and collect article ids + pair ids needed for join queries
  type Classified = {
    pair: Pair;
    promptChoice: string | null;
    sa: number; sb: number; scoreDiff: number;
    betaA: number | null; betaB: number | null; betaDiff: number;
  };
  const disagreements: Classified[] = [];
  for (const p of decided) {
    const sa = scoreMap.get(p.article_a_id);
    const sb = scoreMap.get(p.article_b_id);
    if (sa === undefined || sb === undefined) continue;

    let promptChoice: string | null;
    if (sa === sb) promptChoice = null;
    else promptChoice = sa > sb ? p.article_a_id : p.article_b_id;

    const isTie = promptChoice === null;
    const isMismatch = !isTie && promptChoice !== p.winner_id;
    if (!isMismatch && !(isTie && includeTies)) continue;

    const scoreDiff = Math.abs(sa - sb);
    if (scoreDiff < minScoreDiff && !isTie) continue;

    const betaA = betaMap.has(p.article_a_id) ? betaMap.get(p.article_a_id)! : null;
    const betaB = betaMap.has(p.article_b_id) ? betaMap.get(p.article_b_id)! : null;
    const betaDiff = (betaA !== null && betaB !== null) ? Math.abs(betaA - betaB) : 0;

    disagreements.push({ pair: p, promptChoice, sa, sb, scoreDiff, betaA, betaB, betaDiff });
  }

  if (disagreements.length === 0) return [];

  // Bulk-load articles, reasons, categories for the affected pairs
  const articleIds = new Set<string>();
  const pairIds: string[] = [];
  for (const d of disagreements) {
    articleIds.add(d.pair.article_a_id);
    articleIds.add(d.pair.article_b_id);
    pairIds.push(d.pair.id);
  }

  const { data: articleRows } = await db
    .from("lab_value_articles")
    .select("id, title, article_type")
    .in("id", [...articleIds]);
  type ArtRow = { id: string; title: string; article_type: string | null };
  const articleMap = new Map<string, ArtRow>();
  for (const a of (articleRows ?? []) as ArtRow[]) articleMap.set(a.id, a);

  const { data: reasonRows } = await db
    .from("lab_value_pair_reasons")
    .select("pair_id, category_id, notes")
    .in("pair_id", pairIds);
  type ReasonRow = { pair_id: string; category_id: string; notes: string | null };
  const rRows = (reasonRows ?? []) as ReasonRow[];

  const { data: catRows } = await db
    .from("lab_value_reason_categories")
    .select("id, label")
    .eq("module_id", moduleId);
  type CatRow = { id: string; label: string };
  const catMap = new Map<string, string>();
  for (const c of (catRows ?? []) as CatRow[]) catMap.set(c.id, c.label);

  const reasonsByPair = new Map<string, { labels: Set<string>; notes: Set<string> }>();
  for (const r of rRows) {
    let entry = reasonsByPair.get(r.pair_id);
    if (!entry) { entry = { labels: new Set(), notes: new Set() }; reasonsByPair.set(r.pair_id, entry); }
    const label = catMap.get(r.category_id);
    if (label) entry.labels.add(label);
    if (r.notes && r.notes.trim().length > 0) entry.notes.add(r.notes.trim());
  }

  const rows: DisagreementRow[] = disagreements.map(d => {
    const artA = articleMap.get(d.pair.article_a_id);
    const artB = articleMap.get(d.pair.article_b_id);
    const reasons = reasonsByPair.get(d.pair.id);
    return {
      pairId:         d.pair.id,
      humanChoiceId:  d.pair.winner_id,
      promptChoiceId: d.promptChoice,
      scoreA:         d.sa,
      scoreB:         d.sb,
      scoreDiff:      d.scoreDiff,
      betaA:          d.betaA,
      betaB:          d.betaB,
      betaDiff:       d.betaDiff,
      articleA:       artA ?? { id: d.pair.article_a_id, title: "(missing)", article_type: null },
      articleB:       artB ?? { id: d.pair.article_b_id, title: "(missing)", article_type: null },
      reasons:        reasons ? [...reasons.labels].sort() : [],
      notes:          reasons && reasons.notes.size > 0 ? [...reasons.notes].join(" · ") : null,
    };
  });

  // Sort by biggest β-difference first (human was most confident)
  rows.sort((a, b) => b.betaDiff - a.betaDiff);
  return rows;
}
