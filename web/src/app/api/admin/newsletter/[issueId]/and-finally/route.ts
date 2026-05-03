import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

const schema = z.object({
  article_id: z.string().uuid().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { issueId } = await params;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { article_id } = parsed.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  if (article_id !== null) {
    const { data: article, error: articleErr } = await admin
      .from("articles")
      .select("id, and_finally_candidate, and_finally_used_in_edition_id")
      .eq("id", article_id)
      .single();

    if (articleErr || !article) {
      return NextResponse.json({ ok: false, error: "Article not found" }, { status: 404 });
    }

    if (!article.and_finally_candidate) {
      return NextResponse.json(
        { ok: false, error: "Article is not marked as an And finally candidate" },
        { status: 400 }
      );
    }

    const usedIn = article.and_finally_used_in_edition_id;
    if (usedIn !== null && usedIn !== issueId) {
      return NextResponse.json(
        { ok: false, error: "Article has already been used in another edition" },
        { status: 409 }
      );
    }
  }

  const { error } = await admin
    .from("newsletter_editions")
    .update({ and_finally_article_id: article_id })
    .eq("id", issueId);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, and_finally_article_id: article_id });
}
