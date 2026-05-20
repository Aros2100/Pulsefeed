import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { runId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  try {
    // Load run to get prompt_id + status
    const { data: run } = await admin
      .from('lab_value_validation_runs')
      .select('id, prompt_id, status')
      .eq('id', runId)
      .maybeSingle();
    if (!run) return NextResponse.json({ ok: false, error: 'Run not found' }, { status: 404 });
    type Run = { id: string; prompt_id: string; status: string };
    const r = run as Run;

    // Find first item that is scored, has anchors assigned, but not yet validated
    const { data: item } = await admin
      .from('lab_value_validation_items')
      .select('id, validation_article_id, craft_score, dimensions, reasoning, anchor_low_id, anchor_same_id, anchor_high_id')
      .eq('run_id', runId)
      .not('scored_at', 'is', null)
      .not('anchor_low_id', 'is', null)
      .is('validated_at', null)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!item) {
      return NextResponse.json({ ok: true, done: true, runStatus: r.status });
    }

    type Item = {
      id: string;
      validation_article_id: string;
      craft_score: number | string | null;
      dimensions: unknown;
      reasoning: string | null;
      anchor_low_id: string | null;
      anchor_same_id: string | null;
      anchor_high_id: string | null;
    };
    const it = item as Item;

    // Load validation article (full Article-compatible fields + abstract)
    const { data: valArt } = await admin
      .from('lab_value_validation_articles')
      .select('id, pmid, title, journal, article_type, published_date, short_headline, resume, bottom_line, sari')
      .eq('id', it.validation_article_id)
      .maybeSingle();

    // Load anchor articles from lab_value_articles — full Article-compatible fields
    const anchorIds = [it.anchor_low_id, it.anchor_same_id, it.anchor_high_id].filter(Boolean) as string[];
    const anchorMap: Record<string, unknown> = {};
    if (anchorIds.length > 0) {
      const { data: anchorRows } = await admin
        .from('lab_value_articles')
        .select('id, pmid, title, journal, article_type, published_date, short_headline, resume, bottom_line, sari')
        .in('id', anchorIds);
      type AnchorRow = { id: string; pmid: string | null; title: string; journal: string | null; article_type: string | null; published_date: string | null; short_headline: string | null; resume: string | null; bottom_line: string | null; sari: unknown };
      for (const a of ((anchorRows ?? []) as AnchorRow[])) {
        anchorMap[a.id] = a;
      }
    }

    // Get craft_scores for anchors from lab_value_article_scores
    const anchorScoreMap: Record<string, number | null> = {};
    if (anchorIds.length > 0) {
      const { data: scoreRows } = await admin
        .from('lab_value_article_scores')
        .select('article_id, craft_score')
        .eq('prompt_id', r.prompt_id)
        .in('article_id', anchorIds);
      type ScoreRow = { article_id: string; craft_score: number | string | null };
      for (const s of ((scoreRows ?? []) as ScoreRow[])) {
        anchorScoreMap[s.article_id] = s.craft_score !== null ? Number(s.craft_score) : null;
      }
    }

    return NextResponse.json({
      ok: true,
      done: false,
      runStatus: r.status,
      item: {
        id:             it.id,
        craftScore:     it.craft_score !== null ? Number(it.craft_score) : null,
        dimensions:     it.dimensions,
        reasoning:      it.reasoning,
        article:        valArt,
        anchorLow:      it.anchor_low_id   ? { ...(anchorMap[it.anchor_low_id]   ?? {}), craft_score: anchorScoreMap[it.anchor_low_id]   ?? null } : null,
        anchorSame:     it.anchor_same_id  ? { ...(anchorMap[it.anchor_same_id]  ?? {}), craft_score: anchorScoreMap[it.anchor_same_id]  ?? null } : null,
        anchorHigh:     it.anchor_high_id  ? { ...(anchorMap[it.anchor_high_id]  ?? {}), craft_score: anchorScoreMap[it.anchor_high_id]  ?? null } : null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
