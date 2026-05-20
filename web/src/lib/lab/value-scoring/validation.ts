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

export type ValidationStatus = 'pending' | 'scoring' | 'validating' | 'complete';

export type ValidationOutcome = 'agree' | 'overscored' | 'underscored' | 'mixed';

/**
 * Compute the validation outcome from the three anchor comparisons.
 *
 * choice_low / choice_same / choice_high are each 'new' or 'anchor'.
 * 'new' means the human said the new (validation) article is better than the anchor.
 *
 *   newWins === 3 → 'underscored'  (new article beat all anchors — scored too low)
 *   newWins === 0 → 'overscored'   (new article lost to all anchors — scored too high)
 *   low === 'new' && high === 'anchor' → 'agree'  (correct relative position)
 *   else → 'mixed'
 */
export function computeOutcome(low: string, same: string, high: string): ValidationOutcome {
  const newWins = [low, same, high].filter(c => c === 'new').length;
  if (newWins === 3) return 'underscored';
  if (newWins === 0) return 'overscored';
  if (low === 'new' && high === 'anchor') return 'agree';
  return 'mixed';
}

/**
 * Select three anchor articles from lab_value_article_scores for the given prompt.
 * Uses craft_score bands of size 10:
 *   band = floor(craftScore / 10) * 10
 *   low  band = [band - 10, band)
 *   same band = [band, band + 10)
 *   high band = [band + 10, band + 20)
 *
 * Falls back to nearest scored article if band is empty.
 */
export async function selectAnchors(
  db: Db,
  promptId: string,
  craftScore: number,
): Promise<{ lowId: string | null; sameId: string | null; highId: string | null }> {
  // Fetch all scored rows for this prompt (use range to bypass PostgREST 1000-row cap)
  const { data: rows } = await db
    .from('lab_value_article_scores')
    .select('article_id, craft_score')
    .eq('prompt_id', promptId)
    .not('craft_score', 'is', null)
    .range(0, 9999);

  type ScoreRow = { article_id: string; craft_score: number | string };
  const scored = ((rows ?? []) as ScoreRow[]).map(r => ({
    article_id: r.article_id,
    craft_score: Number(r.craft_score),
  }));

  if (scored.length === 0) {
    return { lowId: null, sameId: null, highId: null };
  }

  const band = Math.floor(craftScore / 10) * 10;

  // Partition by band
  const lowBand  = scored.filter(r => r.craft_score >= band - 10 && r.craft_score < band);
  const sameBand = scored.filter(r => r.craft_score >= band       && r.craft_score < band + 10);
  const highBand = scored.filter(r => r.craft_score >= band + 10  && r.craft_score < band + 20);

  function pickRandom(arr: typeof scored): string | null {
    if (arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)].article_id;
  }

  function pickNearest(target: number, exclude: Set<string>): string | null {
    const candidates = scored.filter(r => !exclude.has(r.article_id));
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => Math.abs(a.craft_score - target) - Math.abs(b.craft_score - target));
    return candidates[0].article_id;
  }

  const usedIds = new Set<string>();

  // Try to pick from each band first; fall back to nearest
  const lowId = pickRandom(lowBand) ?? pickNearest(band - 5, usedIds);
  if (lowId) usedIds.add(lowId);

  const sameBandFiltered = sameBand.filter(r => !usedIds.has(r.article_id));
  const sameId = pickRandom(sameBandFiltered) ?? pickNearest(band + 5, usedIds);
  if (sameId) usedIds.add(sameId);

  const highBandFiltered = highBand.filter(r => !usedIds.has(r.article_id));
  const highId = pickRandom(highBandFiltered) ?? pickNearest(band + 15, usedIds);

  return { lowId, sameId, highId };
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

  // 5. Load unscored items with their validation article info
  const { data: rawItems } = await db
    .from('lab_value_validation_items')
    .select('id, validation_article_id')
    .eq('run_id', runId)
    .is('scored_at', null);

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
            })
            .eq('id', item.id);
        } catch (err) {
          // Log but don't abort the whole run
          console.error(`[scoreValidationRun] item ${item.id} failed:`, err instanceof Error ? err.message : err);
        }
      }));
    }
  }

  // 7. Assign anchors for every scored item that doesn't have anchors yet
  const { data: scoredItems } = await db
    .from('lab_value_validation_items')
    .select('id, craft_score')
    .eq('run_id', runId)
    .not('scored_at', 'is', null)
    .is('anchor_low_id', null);

  type ScoredItem = { id: string; craft_score: number | string | null };
  const toAnchor = ((scoredItems ?? []) as ScoredItem[]).filter(i => i.craft_score !== null);

  for (const item of toAnchor) {
    const cs = Number(item.craft_score);
    if (!Number.isFinite(cs)) continue;
    try {
      const { lowId, sameId, highId } = await selectAnchors(db, r.prompt_id, cs);
      await db
        .from('lab_value_validation_items')
        .update({
          anchor_low_id:  lowId,
          anchor_same_id: sameId,
          anchor_high_id: highId,
        })
        .eq('id', item.id);
    } catch (err) {
      console.error(`[scoreValidationRun] anchor assignment failed for item ${item.id}:`, err instanceof Error ? err.message : err);
    }
  }

  // 8. Set status = 'validating'
  await db
    .from('lab_value_validation_runs')
    .update({ status: 'validating' })
    .eq('id', runId);
}
