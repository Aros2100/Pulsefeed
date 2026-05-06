import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRAFT_MODULE_KEY, ARTICLE_TYPE_TARGETS } from "@/lib/lab/value-scoring/craft-config";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Resolve module
  const { data: mod, error: modErr } = await admin
    .from("lab_modules")
    .select("id, phase")
    .eq("module_type", CRAFT_MODULE_KEY.module_type)
    .eq("parameter",   CRAFT_MODULE_KEY.parameter)
    .eq("specialty",   CRAFT_MODULE_KEY.specialty)
    .maybeSingle();

  if (modErr || !mod) {
    return NextResponse.json({ ok: false, error: "Module not found" }, { status: 404 });
  }
  if (mod.phase !== "sample") {
    return NextResponse.json({ ok: false, error: "Module is not in sample phase" }, { status: 409 });
  }
  const moduleId: string = mod.id;

  // Fetch all candidates
  const { data: candidates, error: candErr } = await admin
    .from("lab_value_sample_candidates")
    .select("id, prod_article_id, article_type")
    .eq("module_id", moduleId);

  if (candErr) {
    return NextResponse.json({ ok: false, error: candErr.message }, { status: 500 });
  }

  // Verify all targets are met
  const countByType: Record<string, number> = {};
  for (const c of (candidates ?? []) as { article_type: string }[]) {
    countByType[c.article_type] = (countByType[c.article_type] ?? 0) + 1;
  }
  const unmet: string[] = [];
  for (const [type, target] of Object.entries(ARTICLE_TYPE_TARGETS)) {
    if ((countByType[type] ?? 0) < target) {
      unmet.push(`${type}: ${countByType[type] ?? 0}/${target}`);
    }
  }
  if (unmet.length > 0) {
    return NextResponse.json({
      ok: false,
      error: `Sample incomplete. Unmet targets: ${unmet.join(", ")}`,
    }, { status: 422 });
  }

  // Fetch prod article data for all candidates
  const prodIds = (candidates as { prod_article_id: string }[]).map(c => c.prod_article_id);
  const { data: articles, error: artErr } = await admin
    .from("articles")
    .select("id, pubmed_id, title, journal_abbr, article_type, published_date, short_headline, short_resume, bottom_line, sari_subject, sari_action, sari_result, sari_implication")
    .in("id", prodIds);

  if (artErr) {
    return NextResponse.json({ ok: false, error: artErr.message }, { status: 500 });
  }

  const articleMap = new Map(
    (articles as { id: string }[]).map(a => [a.id, a])
  );

  // Build lab_value_articles insert rows
  const frozenAt = new Date().toISOString();
  type ArtRow = {
    id: string; pubmed_id: string | null; title: string; journal_abbr: string | null;
    article_type: string | null; published_date: string | null; short_headline: string | null;
    short_resume: string | null; bottom_line: string | null;
    sari_subject: string | null; sari_action: string | null;
    sari_result: string | null; sari_implication: string | null;
  };
  const insertRows = (candidates as { id: string; prod_article_id: string; article_type: string }[])
    .map(c => {
      const a = articleMap.get(c.prod_article_id) as ArtRow | undefined;
      if (!a) return null;
      return {
        module_id:       moduleId,
        prod_article_id: c.prod_article_id,
        pmid:            a.pubmed_id,
        title:           a.title,
        journal:         a.journal_abbr,
        article_type:    a.article_type,
        published_date:  a.published_date,
        short_headline:  a.short_headline,
        resume:          a.short_resume,
        bottom_line:     a.bottom_line,
        sari: {
          subject:     a.sari_subject,
          action:      a.sari_action,
          result:      a.sari_result,
          implication: a.sari_implication,
        },
        frozen_at: frozenAt,
      };
    })
    .filter(Boolean);

  const { error: insertErr } = await admin.from("lab_value_articles").insert(insertRows);
  if (insertErr) {
    return NextResponse.json({ ok: false, error: `Freeze failed: ${insertErr.message}` }, { status: 500 });
  }

  // Delete candidates
  const { error: delErr } = await admin
    .from("lab_value_sample_candidates")
    .delete()
    .eq("module_id", moduleId);
  if (delErr) {
    return NextResponse.json({ ok: false, error: `Candidate cleanup failed: ${delErr.message}` }, { status: 500 });
  }

  // Advance phase
  const { error: phaseErr } = await admin
    .from("lab_modules")
    .update({ phase: "pairwise", updated_at: frozenAt })
    .eq("id", moduleId);
  if (phaseErr) {
    return NextResponse.json({ ok: false, error: `Phase update failed: ${phaseErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, frozen: insertRows.length });
}
