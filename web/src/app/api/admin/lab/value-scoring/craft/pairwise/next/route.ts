import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_SIZE } from "@/lib/lab/value-scoring/craft-config";
import { resolveModule, findOpenSession, sessionDecidedCount } from "@/lib/lab/value-scoring/session";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const mod = await resolveModule(admin);
  if (!mod.ok) return NextResponse.json({ ok: false, error: mod.error }, { status: mod.status });
  const { moduleId } = mod;

  // Resolve open session — or create new if needed
  let sessionId = await findOpenSession(admin, moduleId);
  let sessionDecided = sessionId ? await sessionDecidedCount(admin, sessionId) : 0;

  // Find next pair without a winner. Prefer pairs already attached to the open session.
  let pair: { id: string; article_a_id: string; article_b_id: string; session_id: string | null } | null = null;

  if (sessionId) {
    const { data: openPair } = await admin
      .from("lab_value_pairs")
      .select("id, article_a_id, article_b_id, session_id")
      .eq("module_id", moduleId)
      .eq("session_id", sessionId)
      .is("winner_id", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (openPair) pair = openPair;
  }

  // Otherwise grab a never-touched pair
  if (!pair) {
    const { data: freshPair } = await admin
      .from("lab_value_pairs")
      .select("id, article_a_id, article_b_id, session_id")
      .eq("module_id", moduleId)
      .is("session_id", null)
      .is("winner_id", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (freshPair) pair = freshPair;
  }

  if (!pair) {
    return NextResponse.json({ ok: true, complete: true });
  }

  // If no open session, create one and attach this pair
  if (!sessionId) {
    sessionId = randomUUID();
    sessionDecided = 0;
  }

  // Attach pair to current session if not already attached
  if (pair.session_id !== sessionId) {
    const { error: updErr } = await admin
      .from("lab_value_pairs")
      .update({ session_id: sessionId, updated_at: new Date().toISOString() })
      .eq("id", pair.id);
    if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  // Load article data for both sides
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
  const articleA = arr.find(a => a.id === pair!.article_a_id) ?? null;
  const articleB = arr.find(a => a.id === pair!.article_b_id) ?? null;

  return NextResponse.json({
    ok: true,
    pairId: pair.id,
    sessionId,
    sessionDecided,
    sessionSize: SESSION_SIZE,
    articleA,
    articleB,
  });
}
