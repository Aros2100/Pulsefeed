// Craft Validation Lab — scoring and outcome logic.
// Scores production-like articles with a prompt, assigns anchor comparisons
// from the trained article pool, and records human validation choices.

import { trackedCall } from "@/lib/ai/tracked-client";
import {
  buildScoringRequest,
  parseScoringResponse,
  parseWeightsFromPrompt,
  type ScoringArticle,
} from "@/lib/lab/value-scoring/scoring";
import { SCORING_CONCURRENCY } from "@/lib/lab/value-scoring/craft-config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type ValidationStatus = 'pending' | 'scoring' | 'scoring_failed' | 'validating' | 'complete';

export type ValidationOutcome = 'agree' | 'overscored' | 'underscored' | 'mixed';

/**
 * Compute the validation outcome for legacy 2-anchor items. Pass null for an anchor
 * that was not available.
 *
 * Both anchors present:
 *   new+new → underscored | anchor+anchor → overscored
 *   new+anchor → agree    | anchor+new   → mixed
 *
 * Only lower anchor:
 *   low=new → agree (article sits above lower as expected)
 *   low=anchor → overscored (article lost to lower anchor)
 *
 * Only upper anchor:
 *   high=anchor → agree (article sits below upper as expected)
 *   high=new → underscored (article beat upper anchor)
 */
export function computeOutcome(
  low:  'new' | 'anchor' | null,
  high: 'new' | 'anchor' | null,
): ValidationOutcome {
  if (low !== null && high !== null) {
    if (low === 'new'    && high === 'new')    return 'underscored';
    if (low === 'anchor' && high === 'anchor') return 'overscored';
    if (low === 'new'    && high === 'anchor') return 'agree';
    return 'mixed';
  }
  if (low  !== null) return low  === 'new'    ? 'agree' : 'overscored';
  if (high !== null) return high === 'anchor' ? 'agree' : 'underscored';
  return 'agree';
}

/**
 * Compute the validation outcome for single-anchor items.
 *
 *   lower anchor: choice=new → agree (article beat a lower anchor, as expected)
 *                 choice=anchor → overscored (article lost to lower anchor)
 *   upper anchor: choice=anchor → agree (article lost to upper anchor, as expected)
 *                 choice=new → underscored (article beat upper anchor unexpectedly)
 */
export function computeOutcomeSingleAnchor(
  side:   'lower' | 'upper',
  choice: 'new'   | 'anchor',
): ValidationOutcome {
  if (side === 'lower') return choice === 'new' ? 'agree' : 'overscored';
  return choice === 'anchor' ? 'agree' : 'underscored';
}

/**
 * Select a single anchor article for a new article with the given craft_score X.
 *
 *   Lower anchor: craft_score in [X−15, X−10]
 *   Upper anchor: craft_score in [X+10, X+15]
 *
 * Side selection:
 *   - If forceSide provided: use it
 *   - If neither side has candidates: return null
 *   - If only one side has candidates: use that side
 *   - If both have candidates: 50/50 random
 *
 * If the chosen side has no candidates, falls back to the other side.
 */
export async function selectSingleAnchor(
  db: Db,
  promptId: string,
  craftScore: number,
  forceSide?: 'lower' | 'upper',
): Promise<{ anchorId: string | null; anchorSide: 'lower' | 'upper' | null }> {
  const { data: rows } = await db
    .from('lab_value_article_scores')
    .select('article_id, craft_score')
    .eq('prompt_id', promptId)
    .not('craft_score', 'is', null)
    .range(0, 9999);

  type ScoreRow = { article_id: string; craft_score: number | string };
  const scored = ((rows ?? []) as ScoreRow[])
    .map(r => ({ article_id: r.article_id, craft_score: Number(r.craft_score) }))
    .filter(r => Number.isFinite(r.craft_score));

  if (scored.length === 0) return { anchorId: null, anchorSide: null };

  function pickRandom(candidates: typeof scored): string | null {
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)].article_id;
  }

  const lowerCandidates = scored.filter(r =>
    r.craft_score >= craftScore - 15 && r.craft_score <= craftScore - 10
  );
  const upperCandidates = scored.filter(r =>
    r.craft_score >= craftScore + 10 && r.craft_score <= craftScore + 15
  );

  let side: 'lower' | 'upper';

  if (forceSide) {
    side = forceSide;
  } else if (lowerCandidates.length === 0 && upperCandidates.length === 0) {
    return { anchorId: null, anchorSide: null };
  } else if (lowerCandidates.length > 0 && upperCandidates.length === 0) {
    side = 'lower';
  } else if (upperCandidates.length > 0 && lowerCandidates.length === 0) {
    side = 'upper';
  } else {
    side = Math.random() < 0.5 ? 'lower' : 'upper';
  }

  // Try chosen side; fall back to other if empty
  const primary   = side === 'lower' ? lowerCandidates : upperCandidates;
  const fallback  = side === 'lower' ? upperCandidates : lowerCandidates;
  const chosen    = primary.length > 0 ? primary : fallback;
  const finalSide = primary.length > 0 ? side : (side === 'lower' ? 'upper' : 'lower');

  const anchorId = pickRandom(chosen);
  return { anchorId, anchorSide: anchorId ? finalSide : null };
}

/**
 * Select N validation articles for a new run, implementing the rotation strategy:
 *
 *   Priority 0: Never validated with single-anchor approach (lowerCount === 0 AND upperCount === 0)
 *   Priority 1: One side done AND at least 100 total single-anchor items validated since → ready for second side
 *   Skip: Both sides done
 *
 * Sort by priority ASC, then lastValidatedAt ASC NULLS FIRST.
 * Returns first N article IDs.
 */
export async function selectArticlesForRun(
  db: Db,
  moduleId: string,
  n: number,
): Promise<string[]> {
  // 1. Fetch all validation articles for this module
  const { data: poolRows } = await db
    .from('lab_value_validation_articles')
    .select('id')
    .eq('module_id', moduleId)
    .range(0, 9999);

  type PoolRow = { id: string };
  const pool = ((poolRows ?? []) as PoolRow[]).map(r => r.id);
  if (pool.length === 0) return [];

  // 2. Fetch all validated single-anchor items
  const { data: validatedRows } = await db
    .from('lab_value_validation_items')
    .select('validation_article_id, anchor_side, validated_at')
    .not('validated_at', 'is', null)
    .not('anchor_side', 'is', null)
    .range(0, 9999);

  type ValidatedRow = {
    validation_article_id: string;
    anchor_side: string;
    validated_at: string;
  };
  const validatedItems = ((validatedRows ?? []) as ValidatedRow[]);

  // 3. Total validated single-anchor items (for 100-item threshold)
  const totalValidated = validatedItems.length;

  // 4. Per article stats
  const articleStats = new Map<string, {
    lowerCount: number;
    upperCount: number;
    lastValidatedAt: string | null;
  }>();

  for (const id of pool) {
    articleStats.set(id, { lowerCount: 0, upperCount: 0, lastValidatedAt: null });
  }

  for (const item of validatedItems) {
    const s = articleStats.get(item.validation_article_id);
    if (!s) continue;
    if (item.anchor_side === 'lower') s.lowerCount++;
    else if (item.anchor_side === 'upper') s.upperCount++;
    if (!s.lastValidatedAt || item.validated_at > s.lastValidatedAt) {
      s.lastValidatedAt = item.validated_at;
    }
  }

  // 5. Per article: count total validated single-anchor items after lastValidatedAt
  //    (proxy: use totalValidated as a global counter since we track per-article last date)
  //    For simplicity: count items with validated_at > article's lastValidatedAt
  const itemsSinceMap = new Map<string, number>();
  for (const [id, s] of articleStats.entries()) {
    if (!s.lastValidatedAt) {
      itemsSinceMap.set(id, totalValidated);
    } else {
      const since = validatedItems.filter(i => i.validated_at > s.lastValidatedAt!).length;
      itemsSinceMap.set(id, since);
    }
  }

  // 6. Build candidate list with priorities
  type Candidate = { id: string; priority: number; lastValidatedAt: string | null };
  const candidates: Candidate[] = [];

  for (const id of pool) {
    const s = articleStats.get(id)!;
    const { lowerCount, upperCount, lastValidatedAt } = s;
    const itemsSince = itemsSinceMap.get(id) ?? 0;

    if (lowerCount === 0 && upperCount === 0) {
      // Never validated with single-anchor
      candidates.push({ id, priority: 0, lastValidatedAt });
    } else if ((lowerCount > 0 && upperCount === 0) || (upperCount > 0 && lowerCount === 0)) {
      // One side done
      if (itemsSince >= 100) {
        // Ready for second side
        candidates.push({ id, priority: 1, lastValidatedAt });
      }
      // else: not ready yet, skip
    }
    // Both sides done → skip
  }

  // 7. Sort by priority ASC, then lastValidatedAt ASC NULLS FIRST
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.lastValidatedAt === null && b.lastValidatedAt === null) return 0;
    if (a.lastValidatedAt === null) return -1;
    if (b.lastValidatedAt === null) return 1;
    return a.lastValidatedAt < b.lastValidatedAt ? -1 : 1;
  });

  return candidates.slice(0, n).map(c => c.id);
}

/**
 * Score all unscored items in a validation run, then assign anchor articles.
 * Sets run status to 'scoring' during scoring and 'validating' when anchors are assigned.
 */
export async function scoreValidationRun(db: Db, runId: string): Promise<void> {
  // 1. Load run
  const { data: run } = await db
    .from('lab_value_validation_runs')
    .select('id, prompt_id, status')
    .eq('id', runId)
    .maybeSingle();
  if (!run) throw new Error('Validation run not found');

  type Run = { id: string; prompt_id: string; status: string };
  const r = run as Run;

  // 2. Set status = 'scoring'
  await db
    .from('lab_value_validation_runs')
    .update({ status: 'scoring' })
    .eq('id', runId);

  // 3. Load prompt text
  const { data: prompt } = await db
    .from('lab_value_prompts')
    .select('id, prompt_text, version')
    .eq('id', r.prompt_id)
    .maybeSingle();
  if (!prompt) throw new Error('Prompt not found');
  type Prompt = { id: string; prompt_text: string; version: number };
  const p = prompt as Prompt;

  // 4. Parse weights
  const weights = parseWeightsFromPrompt(p.prompt_text);

  // 5. Load items without a successful score (covers first attempt AND retries after failures)
  const { data: rawItems } = await db
    .from('lab_value_validation_items')
    .select('id, validation_article_id')
    .eq('run_id', runId)
    .is('craft_score', null);

  type ItemRow = { id: string; validation_article_id: string };
  const items = ((rawItems ?? []) as ItemRow[]);

  if (items.length > 0) {
    const articleIds = items.map(i => i.validation_article_id);
    const { data: articleRows } = await db
      .from('lab_value_validation_articles')
      .select('id, title, journal, article_type, abstract')
      .in('id', articleIds);

    type ArtRow = { id: string; title: string; journal: string | null; article_type: string | null; abstract: string | null };
    const artMap = new Map<string, ScoringArticle>(
      ((articleRows ?? []) as ArtRow[]).map(a => [a.id, {
        id:           a.id,
        title:        a.title,
        journal:      a.journal,
        article_type: a.article_type,
        abstract:     a.abstract,
      }])
    );

    const modelKey = `value_scoring_craft_validation_v${p.version}`;
    const task     = 'value_scoring_craft_validation';

    // 6. Score in chunks of SCORING_CONCURRENCY
    for (let i = 0; i < items.length; i += SCORING_CONCURRENCY) {
      const chunk = items.slice(i, i + SCORING_CONCURRENCY);
      await Promise.all(chunk.map(async (item) => {
        const article = artMap.get(item.validation_article_id);
        if (!article) return;
        try {
          const params  = buildScoringRequest(article, p.prompt_text);
          const message = await trackedCall(modelKey, params, article.id, task);
          const raw     = (message.content[0] as { type: string; text: string }).text.trim();
          const { craftScore, dimensions, reasoning } = parseScoringResponse(raw, weights);
          await db
            .from('lab_value_validation_items')
            .update({
              craft_score: craftScore,
              dimensions,
              reasoning,
              scored_at:   new Date().toISOString(),
              score_error: null,
            })
            .eq('id', item.id);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[scoreValidationRun] item ${item.id} failed:`, errMsg);
          // Mark item so its failure is visible and the run can still transition
          await db
            .from('lab_value_validation_items')
            .update({
              scored_at:   new Date().toISOString(),
              score_error: errMsg.slice(0, 500),
            })
            .eq('id', item.id);
        }
      }));
    }
  }

  // 7. Gate: if zero items have a valid score, the entire batch failed
  const { count: successCount } = await db
    .from('lab_value_validation_items')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', runId)
    .not('craft_score', 'is', null);

  if ((successCount ?? 0) === 0) {
    await db
      .from('lab_value_validation_runs')
      .update({ status: 'scoring_failed' })
      .eq('id', runId);
    return;
  }

  // 8. Assign single anchors for successfully scored items that don't have anchors yet
  const { data: scoredItems } = await db
    .from('lab_value_validation_items')
    .select('id, validation_article_id, craft_score')
    .eq('run_id', runId)
    .not('craft_score', 'is', null)
    .is('anchor_id', null)
    .is('anchor_low_id', null);

  type ScoredItem = { id: string; validation_article_id: string; craft_score: number | string | null };
  const toAnchor = ((scoredItems ?? []) as ScoredItem[]).filter(i => i.craft_score !== null);

  // Fetch which sides have already been done for these articles (from prior runs)
  const articleIdsToAnchor = [...new Set(toAnchor.map(i => i.validation_article_id))];
  const prevSideMap = new Map<string, { lowerDone: boolean; upperDone: boolean }>();

  if (articleIdsToAnchor.length > 0) {
    const { data: prevValidations } = await db
      .from('lab_value_validation_items')
      .select('validation_article_id, anchor_side')
      .in('validation_article_id', articleIdsToAnchor)
      .not('anchor_side', 'is', null)
      .not('validated_at', 'is', null);

    type PrevRow = { validation_article_id: string; anchor_side: string };
    for (const pv of ((prevValidations ?? []) as PrevRow[])) {
      if (!prevSideMap.has(pv.validation_article_id)) {
        prevSideMap.set(pv.validation_article_id, { lowerDone: false, upperDone: false });
      }
      const s = prevSideMap.get(pv.validation_article_id)!;
      if (pv.anchor_side === 'lower') s.lowerDone = true;
      if (pv.anchor_side === 'upper') s.upperDone = true;
    }
  }

  for (const item of toAnchor) {
    const cs = Number(item.craft_score);
    if (!Number.isFinite(cs)) continue;
    try {
      const prev = prevSideMap.get(item.validation_article_id);
      let forceSide: 'lower' | 'upper' | undefined;
      if (prev?.lowerDone && !prev?.upperDone) forceSide = 'upper';
      else if (prev?.upperDone && !prev?.lowerDone) forceSide = 'lower';

      const { anchorId, anchorSide } = await selectSingleAnchor(db, r.prompt_id, cs, forceSide);
      await db
        .from('lab_value_validation_items')
        .update({
          anchor_id:   anchorId,
          anchor_side: anchorSide,
        })
        .eq('id', item.id);
    } catch (err) {
      console.error(`[scoreValidationRun] anchor assignment failed for item ${item.id}:`, err instanceof Error ? err.message : err);
    }
  }

  // 9. Set status = 'validating'
  await db
    .from('lab_value_validation_runs')
    .update({ status: 'validating' })
    .eq('id', runId);
}
