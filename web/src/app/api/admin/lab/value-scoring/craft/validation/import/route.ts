import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRAFT_MODULE_KEY } from "@/lib/lab/value-scoring/craft-config";

const schema = z.object({
  count: z.number().int().min(1).max(2000).default(500),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  let body: unknown;
  try { body = await req.json(); } catch {
    body = {};
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }
  const { count } = parsed.data;

  try {
    // Resolve module
    const { data: mod } = await admin
      .from('lab_modules')
      .select('id')
      .eq('module_type', CRAFT_MODULE_KEY.module_type)
      .eq('parameter',   CRAFT_MODULE_KEY.parameter)
      .eq('specialty',   CRAFT_MODULE_KEY.specialty)
      .maybeSingle();
    if (!mod) return NextResponse.json({ ok: false, error: 'Module not found' }, { status: 404 });
    const moduleId = (mod as { id: string }).id;

    // 1. Get already-imported prod_article_ids
    const { data: existingRows } = await admin
      .from('lab_value_validation_articles')
      .select('prod_article_id')
      .eq('module_id', moduleId)
      .not('prod_article_id', 'is', null)
      .range(0, 9999);
    type IdRow = { prod_article_id: string };
    const alreadyImported = new Set<string>(
      ((existingRows ?? []) as IdRow[]).map(r => r.prod_article_id)
    );

    // 2. Get article IDs already in the training pool
    const { data: sampleRows } = await admin
      .from('lab_value_articles')
      .select('prod_article_id')
      .eq('module_id', moduleId)
      .not('prod_article_id', 'is', null)
      .range(0, 9999);
    const inTrainingPool = new Set<string>(
      ((sampleRows ?? []) as IdRow[]).map(r => r.prod_article_id)
    );

    // 3. Fetch candidate articles from production — need abstract + enrichment fields
    const { data: candidates } = await admin
      .from('articles')
      .select('id, pubmed_id, title, abstract, article_type, journal_abbr, published_date, short_headline, short_resume, bottom_line, sari_subject, sari_action, sari_result, sari_implication')
      .not('abstract', 'is', null)
      .not('title', 'is', null)
      .not('short_headline', 'is', null)
      .not('short_resume', 'is', null)
      .not('bottom_line', 'is', null)
      .order('pubmed_indexed_at', { ascending: false })
      .range(0, Math.min(count * 4, 8000)); // over-fetch to account for exclusions

    type ArtRow = {
      id: string;
      pubmed_id: string | null;
      title: string;
      abstract: string | null;
      article_type: string | null;
      journal_abbr: string | null;
      published_date: string | null;
      short_headline: string | null;
      short_resume: string | null;
      bottom_line: string | null;
      sari_subject: string | null;
      sari_action: string | null;
      sari_result: string | null;
      sari_implication: string | null;
    };

    const arts = ((candidates ?? []) as ArtRow[])
      .filter(a => !alreadyImported.has(a.id) && !inTrainingPool.has(a.id) && a.abstract && a.abstract.length >= 50)
      .slice(0, count);

    if (arts.length === 0) {
      return NextResponse.json({ ok: true, imported: 0 });
    }

    // 4. Build insert rows
    const now = new Date().toISOString();
    const insertRows = arts.map(a => ({
      module_id:       moduleId,
      prod_article_id: a.id,
      pmid:            a.pubmed_id,
      title:           a.title,
      abstract:        a.abstract!,
      article_type:    a.article_type,
      journal:         a.journal_abbr,
      published_date:  a.published_date,
      short_headline:  a.short_headline,
      resume:          a.short_resume,
      bottom_line:     a.bottom_line,
      sari: (a.sari_subject || a.sari_action || a.sari_result || a.sari_implication)
        ? {
            subject:     a.sari_subject,
            action:      a.sari_action,
            result:      a.sari_result,
            implication: a.sari_implication,
          }
        : null,
      frozen_at:   now,
      imported_at: now,
    }));

    // Insert in batches of 100
    const BATCH = 100;
    let imported = 0;
    for (let i = 0; i < insertRows.length; i += BATCH) {
      const batch = insertRows.slice(i, i + BATCH);
      const { error } = await admin.from('lab_value_validation_articles').insert(batch);
      if (error) throw new Error(`Insert failed: ${error.message}`);
      imported += batch.length;
    }

    return NextResponse.json({ ok: true, imported });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
