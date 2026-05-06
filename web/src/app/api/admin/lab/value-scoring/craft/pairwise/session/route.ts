import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveModule } from "@/lib/lab/value-scoring/session";

/**
 * GET ?sessionId=…  → list of decided pairs in that session (id, winner_id)
 * GET ?pairId=…     → full pair detail for editing (articles + selected categories + notes)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  const pairId    = searchParams.get("pairId");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const mod = await resolveModule(admin);
  if (!mod.ok) return NextResponse.json({ ok: false, error: mod.error }, { status: mod.status });

  if (sessionId) {
    const { data: rows } = await admin
      .from("lab_value_pairs")
      .select("id, winner_id, updated_at")
      .eq("module_id", mod.moduleId)
      .eq("session_id", sessionId)
      .not("winner_id", "is", null)
      .order("updated_at", { ascending: true });

    type Row = { id: string; winner_id: string | null };
    return NextResponse.json({
      ok: true,
      pairs: (rows ?? []).map((r: Row) => ({ pair_id: r.id, winner_id: r.winner_id })),
    });
  }

  if (pairId) {
    const { data: pair } = await admin
      .from("lab_value_pairs")
      .select("id, session_id, article_a_id, article_b_id, winner_id")
      .eq("id", pairId)
      .eq("module_id", mod.moduleId)
      .maybeSingle();

    if (!pair) return NextResponse.json({ ok: false, error: "Pair not found" }, { status: 404 });

    const { data: articles } = await admin
      .from("lab_value_articles")
      .select("id, pmid, title, journal, article_type, published_date, short_headline, resume, bottom_line, sari")
      .in("id", [pair.article_a_id, pair.article_b_id]);

    type Art = {
      id: string; pmid: string | null; title: string; journal: string | null;
      article_type: string | null; published_date: string | null;
      short_headline: string | null; resume: string | null; bottom_line: string | null;
      sari: { subject?: string; action?: string; result?: string; implication?: string } | null;
    };
    const arr = (articles ?? []) as Art[];

    const { data: reasons } = await admin
      .from("lab_value_pair_reasons")
      .select("category_id, notes")
      .eq("pair_id", pairId);

    type Reason = { category_id: string; notes: string | null };
    const reasonRows = (reasons ?? []) as Reason[];
    const categoryIds = reasonRows.map(r => r.category_id);
    const notes = reasonRows.find(r => r.notes && r.notes.trim().length > 0)?.notes ?? null;

    return NextResponse.json({
      ok: true,
      pair: {
        id:        pair.id,
        sessionId: pair.session_id,
        winnerId:  pair.winner_id,
        categoryIds,
        notes,
        articleA:  arr.find(a => a.id === pair.article_a_id) ?? null,
        articleB:  arr.find(a => a.id === pair.article_b_id) ?? null,
      },
    });
  }

  return NextResponse.json({ ok: false, error: "Provide either sessionId or pairId" }, { status: 400 });
}
