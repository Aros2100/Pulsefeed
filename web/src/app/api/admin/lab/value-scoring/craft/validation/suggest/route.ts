import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackedCall } from "@/lib/ai/tracked-client";

// Sonnet call may take up to 60s
export const maxDuration = 120;

const schema = z.object({
  promptId: z.string().uuid(),
});

const SUGGESTION_MODEL      = 'claude-sonnet-4-6';
const SUGGESTION_MAX_TOKENS = 4000;

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }
  const { promptId } = parsed.data;

  try {
    // Load prompt
    const { data: prompt } = await admin
      .from('lab_value_prompts')
      .select('id, prompt_text, version')
      .eq('id', promptId)
      .maybeSingle();
    if (!prompt) return NextResponse.json({ ok: false, error: 'Prompt not found' }, { status: 404 });
    type Prompt = { id: string; prompt_text: string; version: number };
    const p = prompt as Prompt;

    // Load all disagreement items (outcome != 'agree') for this prompt
    const { data: runRows } = await admin
      .from('lab_value_validation_runs')
      .select('id')
      .eq('prompt_id', promptId)
      .range(0, 9999);
    type RunRow = { id: string };
    const runIds = ((runRows ?? []) as RunRow[]).map(r => r.id);

    if (runIds.length === 0) {
      return NextResponse.json({ ok: false, error: 'No validation runs for this prompt' }, { status: 400 });
    }

    const { data: itemRows } = await admin
      .from('lab_value_validation_items')
      .select('id, validation_article_id, craft_score, reasoning, outcome, choice_low, choice_same, choice_high, anchor_low_id, anchor_same_id, anchor_high_id, validator_notes')
      .in('run_id', runIds)
      .not('outcome', 'is', null)
      .neq('outcome', 'agree')
      .range(0, 9999);

    type ItemRow = {
      id: string;
      validation_article_id: string;
      craft_score: number | string | null;
      reasoning: string | null;
      outcome: string;
      choice_low: string | null;
      choice_same: string | null;
      choice_high: string | null;
      anchor_low_id: string | null;
      anchor_same_id: string | null;
      anchor_high_id: string | null;
      validator_notes: string | null;
    };
    const items = ((itemRows ?? []) as ItemRow[]);

    if (items.length === 0) {
      return NextResponse.json({ ok: false, error: 'No disagreements found for this prompt' }, { status: 400 });
    }

    // Load validation articles
    const valArtIds = [...new Set(items.map(i => i.validation_article_id))];
    const { data: valArts } = await admin
      .from('lab_value_validation_articles')
      .select('id, title, article_type, journal')
      .in('id', valArtIds);
    type ValArt = { id: string; title: string; article_type: string | null; journal: string | null };
    const valArtMap = new Map<string, ValArt>(((valArts ?? []) as ValArt[]).map(a => [a.id, a]));

    // Load anchor articles
    const allAnchorIds = [...new Set(items.flatMap(i =>
      [i.anchor_low_id, i.anchor_same_id, i.anchor_high_id].filter(Boolean) as string[]
    ))];
    const anchorMap: Record<string, { title: string; craft_score: number | null }> = {};
    if (allAnchorIds.length > 0) {
      const { data: anchorArts } = await admin
        .from('lab_value_articles')
        .select('id, title')
        .in('id', allAnchorIds);
      type AnchorArt = { id: string; title: string };
      const anchorArtMap = new Map<string, string>(((anchorArts ?? []) as AnchorArt[]).map(a => [a.id, a.title]));

      const { data: anchorScores } = await admin
        .from('lab_value_article_scores')
        .select('article_id, craft_score')
        .eq('prompt_id', promptId)
        .in('article_id', allAnchorIds);
      type AnchorScore = { article_id: string; craft_score: number | string | null };
      const anchorScoreMap = new Map<string, number | null>(
        ((anchorScores ?? []) as AnchorScore[]).map(s => [s.article_id, s.craft_score !== null ? Number(s.craft_score) : null])
      );

      for (const id of allAnchorIds) {
        anchorMap[id] = {
          title:       anchorArtMap.get(id) ?? 'Unknown',
          craft_score: anchorScoreMap.get(id) ?? null,
        };
      }
    }

    // Format disagreements for the prompt
    const disBlocks = items.slice(0, 30).map((item, i) => {
      const art = valArtMap.get(item.validation_article_id);
      const artTitle = art?.title ?? '?';
      const artType  = art?.article_type ?? '—';
      const cs = item.craft_score !== null ? Number(item.craft_score).toFixed(1) : '?';
      const lines: string[] = [];
      lines.push(`Disagreement ${i + 1} (outcome: ${item.outcome})`);
      lines.push(`  Article: "${artTitle}" [${artType}] · craft_score=${cs}`);
      if (item.reasoning)        lines.push(`  Reasoning: ${item.reasoning.slice(0, 300)}`);
      if (item.validator_notes)  lines.push(`  Validator note: ${item.validator_notes}`);
      if (item.anchor_low_id) {
        const a = anchorMap[item.anchor_low_id];
        lines.push(`  Anchor-low (score ${a?.craft_score?.toFixed(1) ?? '?'}): "${a?.title}" → human chose: ${item.choice_low ?? '?'}`);
      }
      if (item.anchor_same_id) {
        const a = anchorMap[item.anchor_same_id];
        lines.push(`  Anchor-same (score ${a?.craft_score?.toFixed(1) ?? '?'}): "${a?.title}" → human chose: ${item.choice_same ?? '?'}`);
      }
      if (item.anchor_high_id) {
        const a = anchorMap[item.anchor_high_id];
        lines.push(`  Anchor-high (score ${a?.craft_score?.toFixed(1) ?? '?'}): "${a?.title}" → human chose: ${item.choice_high ?? '?'}`);
      }
      return lines.join('\n');
    }).join('\n\n');

    const system = [
      'You are analysing the results of a craft-scoring validation study.',
      'A scoring prompt was used to score medical articles. The scores were compared against trained anchor articles.',
      'Below are the disagreements: cases where the human\'s ranking of the new article vs the anchor did not match the prompt\'s craft_score.',
      '',
      '  overscored  = new article got a high craft_score but the human preferred all anchors over it',
      '  underscored = new article got a low craft_score but the human preferred it over all anchors',
      '  mixed       = inconsistent — human preferred new over some anchors but not others',
      '',
      'Your task: identify patterns in these disagreements and suggest concrete improvements to the scoring prompt.',
      'Focus on: what types of articles are systematically over- or under-scored, what dimensions might be weighted incorrectly, and what heuristics the prompt is missing.',
      '',
      'Return a clear, structured analysis with specific, actionable suggestions. Use plain text (no JSON required).',
    ].join('\n');

    const user = [
      `=== CURRENT PROMPT (v${p.version}) ===`,
      p.prompt_text.slice(0, 3000),
      '',
      `=== ${items.length} DISAGREEMENTS ===`,
      disBlocks,
    ].join('\n');

    const params = {
      model:      SUGGESTION_MODEL,
      max_tokens: SUGGESTION_MAX_TOKENS,
      system,
      messages:   [{ role: 'user' as const, content: user }],
    };

    const message = await trackedCall(
      `value_scoring_craft_validation_suggest_v${p.version}`,
      params,
      undefined,
      'value_scoring_craft_validation_suggest',
    );
    const suggestions = (message.content[0] as { type: string; text: string }).text;

    return NextResponse.json({ ok: true, suggestions });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
