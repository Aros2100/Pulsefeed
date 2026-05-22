import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { selectArticlesForRun } from "@/lib/lab/value-scoring/validation";

const schema = z.object({
  promptId:  z.string().uuid(),
  nArticles: z.number().int().min(1).max(50),
});

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
  const { promptId, nArticles } = parsed.data;

  try {
    // Verify prompt exists and has scores
    const { data: prompt } = await admin
      .from('lab_value_prompts')
      .select('id, module_id, version')
      .eq('id', promptId)
      .maybeSingle();
    if (!prompt) {
      return NextResponse.json({ ok: false, error: 'Prompt not found' }, { status: 404 });
    }
    type Prompt = { id: string; module_id: string; version: number };
    const p = prompt as Prompt;

    // Verify this prompt has been scored
    const { count: scoreCount } = await admin
      .from('lab_value_article_scores')
      .select('article_id', { count: 'exact', head: true })
      .eq('prompt_id', promptId)
      .not('craft_score', 'is', null);
    if (!scoreCount || scoreCount === 0) {
      return NextResponse.json({ ok: false, error: 'Prompt has no scores yet — score it first' }, { status: 400 });
    }

    // Select articles using rotation strategy
    const articleIds = await selectArticlesForRun(admin, p.module_id, nArticles);

    if (articleIds.length === 0) {
      return NextResponse.json({ ok: false, error: 'No validation articles available for a new run (all articles have both sides validated)' }, { status: 400 });
    }

    // Create run
    const { data: runData, error: runErr } = await admin
      .from('lab_value_validation_runs')
      .insert({
        module_id:  p.module_id,
        prompt_id:  promptId,
        n_articles: articleIds.length,
        status:     'pending',
      })
      .select('id')
      .single();
    if (runErr) throw new Error(`Failed to create run: ${runErr.message}`);
    const runId = (runData as { id: string }).id;

    // Create item rows
    const itemRows = articleIds.map(id => ({
      run_id:                runId,
      validation_article_id: id,
    }));
    const { error: itemErr } = await admin
      .from('lab_value_validation_items')
      .insert(itemRows);
    if (itemErr) throw new Error(`Failed to create items: ${itemErr.message}`);

    return NextResponse.json({ ok: true, runId });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
