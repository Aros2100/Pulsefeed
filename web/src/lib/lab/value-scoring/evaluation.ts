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
  pairId:          string;
  humanChoiceId:   string;
  promptChoiceId:  string | null; // null when the prompt tied
  scoreA:          number | null;
  scoreB:          number | null;
  scoreDiff:       number;
  // Raw craft_score (20-100) per article — null for legacy prompts without rubric
  craftScoreA:     number | null;
  craftScoreB:     number | null;
  craftDiff:       number;
  // BT normalised 1-10
  normalizedA:     number | null;
  normalizedB:     number | null;
  normalizedDiff:  number;
  // Prompt dimensions + reasoning per article (null per dimension = not assessable)
  dimensionsA:     Record<string, number | null> | null;
  dimensionsB:     Record<string, number | null> | null;
  reasoningA:      string | null;
  reasoningB:      string | null;
  articleA:        { id: string; title: string; article_type: string | null };
  articleB:        { id: string; title: string; article_type: string | null };
  reasons:         string[];
  notes:           string | null;
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

async function loadPromptChain(db: Db, promptId: string): Promise<{ moduleId: string; chain: string[] }> {
  // Walk parent_prompt_id from the given prompt to its root. Returns prompt
  // IDs ordered from leaf (the given prompt) to root.
  const chain: string[] = [];
  let moduleId = "";
  let current: string | null | undefined = promptId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const { data: row } = await db
      .from("lab_value_prompts")
      .select("id, module_id, parent_prompt_id")
      .eq("id", current)
      .maybeSingle();
    if (!row) break;
    type R = { id: string; module_id: string; parent_prompt_id: string | null };
    const r = row as R;
    chain.push(r.id);
    moduleId = r.module_id;
    current = r.parent_prompt_id;
  }
  if (chain.length === 0) throw new Error("Prompt not found");
  return { moduleId, chain };
}

async function loadModuleId(db: Db, promptId: string): Promise<string> {
  const { moduleId } = await loadPromptChain(db, promptId);
  return moduleId;
}

/**
 * Returns the effective score map for the prompt, walking the parent chain.
 * For each article we use the score from the deepest (leaf-most) prompt that
 * has it — newer overrides older. Within each row we prefer craft_score
 * (20-100) over the legacy 1-10 score, and normalise legacy values into the
 * 20-100 range so the whole map is on a single scale (avoids cross-prompt
 * comparison artefacts when a chain mixes rubric and legacy prompts).
 */
async function loadScoreMap(db: Db, promptId: string): Promise<Map<string, number>> {
  const { chain } = await loadPromptChain(db, promptId);

  const { data: scores } = await db
    .from("lab_value_article_scores")
    .select("prompt_id, article_id, score, craft_score")
    .in("prompt_id", chain)
    .not("score", "is", null);

  type R = { prompt_id: string; article_id: string; score: number | string; craft_score: number | string | null };
  const all = (scores ?? []) as R[];

  // Process in chain order (leaf first). First write wins → leaf overrides parents.
  const priority = new Map<string, number>(chain.map((id, i) => [id, i]));
  const best = new Map<string, { rank: number; value: number }>();
  for (const r of all) {
    const craft = r.craft_score !== null ? Number(r.craft_score) : NaN;
    const legacy = Number(r.score);
    let value: number;
    if (Number.isFinite(craft)) {
      value = craft;
    } else if (Number.isFinite(legacy)) {
      // Scale legacy 1-10 up to 20-100 for chain consistency
      value = (legacy - 1) / 9 * 80 + 20;
    } else continue;
    const rank = priority.get(r.prompt_id) ?? Infinity;
    const prev = best.get(r.article_id);
    if (!prev || rank < prev.rank) best.set(r.article_id, { rank, value });
  }

  const map = new Map<string, number>();
  for (const [articleId, { value }] of best) map.set(articleId, value);
  return map;
}

async function loadNormalizedMap(db: Db, moduleId: string): Promise<Map<string, number>> {
  const { data: rankings } = await db
    .from("lab_value_rankings")
    .select("article_id, normalized_score")
    .eq("module_id", moduleId);

  type R = { article_id: string; normalized_score: number | string | null };
  const map = new Map<string, number>();
  for (const r of (rankings ?? []) as R[]) {
    if (r.normalized_score !== null && r.normalized_score !== undefined) {
      map.set(r.article_id, Number(r.normalized_score));
    }
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
  const moduleId      = await loadModuleId(db, promptId);
  const normalizedMap = await loadNormalizedMap(db, moduleId);
  const scoreMap      = await loadScoreMap(db, promptId);

  const xs: number[] = [];
  const ys: number[] = [];
  for (const [articleId, norm] of normalizedMap) {
    const s = scoreMap.get(articleId);
    if (s === undefined) continue;
    xs.push(norm);
    ys.push(s);
  }

  return { rho: spearman(xs, ys), n: xs.length };
}

interface ArticleScoreDetail {
  craftScore:  number | null;
  dimensions:  Record<string, number | null> | null;
  reasoning:   string | null;
}

/** Loads craft_score, dimensions, reasoning per article from the prompt chain. */
async function loadArticleScoreDetails(
  db: Db,
  chain: string[],
  articleIds: string[],
): Promise<Map<string, ArticleScoreDetail>> {
  if (articleIds.length === 0) return new Map();

  const { data: scores } = await db
    .from("lab_value_article_scores")
    .select("prompt_id, article_id, craft_score, dimensions, reasoning")
    .in("prompt_id", chain)
    .in("article_id", articleIds);

  type R = { prompt_id: string; article_id: string; craft_score: number | string | null; dimensions: unknown; reasoning: string | null };
  const priority = new Map<string, number>(chain.map((id, i) => [id, i]));
  const best = new Map<string, { rank: number } & ArticleScoreDetail>();

  for (const r of (scores ?? []) as R[]) {
    const rank = priority.get(r.prompt_id) ?? Infinity;
    const prev = best.get(r.article_id);
    if (prev && prev.rank <= rank) continue;
    const craft = r.craft_score !== null ? Number(r.craft_score) : null;
    const dims  = (r.dimensions && typeof r.dimensions === "object" && !Array.isArray(r.dimensions))
      ? r.dimensions as Record<string, number>
      : null;
    best.set(r.article_id, {
      rank,
      craftScore: craft !== null && Number.isFinite(craft) ? craft : null,
      dimensions: dims,
      reasoning:  r.reasoning ?? null,
    });
  }

  const result = new Map<string, ArticleScoreDetail>();
  for (const [articleId, { craftScore, dimensions, reasoning }] of best) {
    result.set(articleId, { craftScore, dimensions, reasoning });
  }
  return result;
}

export async function getDisagreements(
  db: Db,
  promptId: string,
  options?: { includeTies?: boolean; minScoreDiff?: number },
): Promise<DisagreementRow[]> {
  const includeTies  = options?.includeTies  ?? false;
  const minScoreDiff = options?.minScoreDiff ?? 0;

  const { moduleId, chain } = await loadPromptChain(db, promptId);
  const scoreMap      = await loadScoreMap(db, promptId);
  const normalizedMap = await loadNormalizedMap(db, moduleId);

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
    promptChoice:  string | null;
    sa: number; sb: number; scoreDiff: number;
    normA: number | null; normB: number | null; normalizedDiff: number;
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

    const normA = normalizedMap.has(p.article_a_id) ? normalizedMap.get(p.article_a_id)! : null;
    const normB = normalizedMap.has(p.article_b_id) ? normalizedMap.get(p.article_b_id)! : null;
    const normalizedDiff = (normA !== null && normB !== null) ? Math.abs(normA - normB) : 0;

    disagreements.push({ pair: p, promptChoice, sa, sb, scoreDiff, normA, normB, normalizedDiff });
  }

  if (disagreements.length === 0) return [];

  // Bulk-load articles, reasons, categories, and score details for affected pairs
  const articleIds = new Set<string>();
  const pairIds: string[] = [];
  for (const d of disagreements) {
    articleIds.add(d.pair.article_a_id);
    articleIds.add(d.pair.article_b_id);
    pairIds.push(d.pair.id);
  }

  const scoreDetails = await loadArticleScoreDetails(db, chain, [...articleIds]);

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
    const artA    = articleMap.get(d.pair.article_a_id);
    const artB    = articleMap.get(d.pair.article_b_id);
    const reasons = reasonsByPair.get(d.pair.id);
    const detA    = scoreDetails.get(d.pair.article_a_id);
    const detB    = scoreDetails.get(d.pair.article_b_id);
    const csA     = detA?.craftScore ?? null;
    const csB     = detB?.craftScore ?? null;
    return {
      pairId:          d.pair.id,
      humanChoiceId:   d.pair.winner_id,
      promptChoiceId:  d.promptChoice,
      scoreA:          d.sa,
      scoreB:          d.sb,
      scoreDiff:       d.scoreDiff,
      craftScoreA:     csA,
      craftScoreB:     csB,
      craftDiff:       csA !== null && csB !== null ? Math.abs(csA - csB) : 0,
      normalizedA:     d.normA,
      normalizedB:     d.normB,
      normalizedDiff:  d.normalizedDiff,
      dimensionsA:     detA?.dimensions ?? null,
      dimensionsB:     detB?.dimensions ?? null,
      reasoningA:      detA?.reasoning ?? null,
      reasoningB:      detB?.reasoning ?? null,
      articleA:        artA ?? { id: d.pair.article_a_id, title: "(missing)", article_type: null },
      articleB:        artB ?? { id: d.pair.article_b_id, title: "(missing)", article_type: null },
      reasons:         reasons ? [...reasons.labels].sort() : [],
      notes:           reasons && reasons.notes.size > 0 ? [...reasons.notes].join(" · ") : null,
    };
  });

  // Sort by biggest craft_score difference first — pairs where the prompt
  // was most wrong in its own terms appear at the top.
  rows.sort((a, b) => b.craftDiff - a.craftDiff);
  return rows;
}
