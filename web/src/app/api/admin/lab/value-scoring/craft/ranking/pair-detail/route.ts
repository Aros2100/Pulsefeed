import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRAFT_MODULE_KEY } from "@/lib/lab/value-scoring/craft-config";

const querySchema = z.object({ pairId: z.string().uuid() });

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid pairId" }, { status: 400 });
  }
  const { pairId } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Verify pair belongs to the craft module
  const { data: mod } = await admin
    .from("lab_modules")
    .select("id")
    .eq("module_type", CRAFT_MODULE_KEY.module_type)
    .eq("parameter",   CRAFT_MODULE_KEY.parameter)
    .eq("specialty",   CRAFT_MODULE_KEY.specialty)
    .maybeSingle();
  if (!mod) return NextResponse.json({ ok: false, error: "Module not found" }, { status: 404 });

  const { data: pair } = await admin
    .from("lab_value_pairs")
    .select("id, module_id, article_a_id, article_b_id, winner_id, session_id")
    .eq("id", pairId)
    .eq("module_id", mod.id)
    .maybeSingle();
  if (!pair) return NextResponse.json({ ok: false, error: "Pair not found" }, { status: 404 });

  type Pair = { id: string; module_id: string; article_a_id: string; article_b_id: string; winner_id: string | null; session_id: string | null };
  const p = pair as Pair;

  // Load both articles + rankings in parallel
  const [
    { data: artARow },
    { data: artBRow },
    { data: rankA },
    { data: rankB },
    { data: reasonRows },
    { data: catRows },
  ] = await Promise.all([
    admin.from("lab_value_articles")
      .select("id, title, journal, article_type, published_date, pmid, short_headline, resume, bottom_line, sari")
      .eq("id", p.article_a_id)
      .maybeSingle(),
    admin.from("lab_value_articles")
      .select("id, title, journal, article_type, published_date, pmid, short_headline, resume, bottom_line, sari")
      .eq("id", p.article_b_id)
      .maybeSingle(),
    admin.from("lab_value_rankings")
      .select("normalized_score")
      .eq("module_id", p.module_id)
      .eq("article_id", p.article_a_id)
      .maybeSingle(),
    admin.from("lab_value_rankings")
      .select("normalized_score")
      .eq("module_id", p.module_id)
      .eq("article_id", p.article_b_id)
      .maybeSingle(),
    admin.from("lab_value_pair_reasons")
      .select("category_id, notes")
      .eq("pair_id", pairId),
    admin.from("lab_value_reason_categories")
      .select("id, label")
      .eq("module_id", p.module_id),
  ]);

  type CatRow    = { id: string; label: string };
  type ReasonRow = { category_id: string; notes: string | null };
  type RankRow   = { normalized_score: number | string | null };

  const catLabel = new Map<string, string>(((catRows ?? []) as CatRow[]).map(c => [c.id, c.label]));
  const reasons = (reasonRows ?? []) as ReasonRow[];

  // Group notes by category label
  const categoryNotes = new Map<string, string[]>();
  for (const r of reasons) {
    const label = catLabel.get(r.category_id);
    if (!label) continue;
    const arr = categoryNotes.get(label) ?? [];
    if (r.notes && r.notes.trim().length > 0) arr.push(r.notes.trim());
    categoryNotes.set(label, arr);
  }
  const reasonDetails = [...categoryNotes.entries()].map(([label, notes]) => ({ label, notes }));

  const normalizedA = (rankA as RankRow | null)?.normalized_score;
  const normalizedB = (rankB as RankRow | null)?.normalized_score;

  return NextResponse.json({
    ok: true,
    pair: {
      id:        p.id,
      winnerId:  p.winner_id,
      sessionId: p.session_id,
    },
    articleA: artARow ? { ...artARow, normalizedScore: normalizedA !== null && normalizedA !== undefined ? Number(normalizedA) : null } : null,
    articleB: artBRow ? { ...artBRow, normalizedScore: normalizedB !== null && normalizedB !== undefined ? Number(normalizedB) : null } : null,
    reasons:  reasonDetails,
  });
}
