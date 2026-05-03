import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: article, error: fetchErr } = await admin
    .from("articles")
    .select("and_finally_candidate, and_finally_used_in_edition_id")
    .eq("id", id)
    .single();

  if (fetchErr || !article) {
    return NextResponse.json({ ok: false, error: "Article not found" }, { status: 404 });
  }

  if (article.and_finally_used_in_edition_id !== null) {
    return NextResponse.json(
      { ok: false, error: "Cannot toggle: article has already been used in a newsletter edition" },
      { status: 409 }
    );
  }

  const newValue = !article.and_finally_candidate;

  const { error: updateErr } = await admin
    .from("articles")
    .update({ and_finally_candidate: newValue })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, and_finally_candidate: newValue });
}
