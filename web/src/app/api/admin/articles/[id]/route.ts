import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logArticleEvent } from "@/lib/article-events";

const schema = z.object({
  specialty_tags:  z.array(z.string()).optional(),
  status:          z.enum(["pending", "approved", "rejected"]).optional(),
  subspecialty_ai: z.array(z.string()).optional(),
}).refine((d) => d.specialty_tags !== undefined || d.status !== undefined || d.subspecialty_ai !== undefined, {
  message: "At least one field must be provided",
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id: articleId } = await params;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }

  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
  }

  const { specialty_tags, status, subspecialty_ai } = result.data;
  const admin = createAdminClient();

  // Fetch current article values for logging and for RPC args
  const { data: article } = await admin
    .from("articles")
    .select("status, specialty_tags")
    .eq("id", articleId)
    .maybeSingle();

  if (!article) {
    return NextResponse.json({ ok: false, error: "Article not found" }, { status: 404 });
  }

  // Update specialty_tags via RPC (bypasses merge trigger)
  if (specialty_tags !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).rpc("replace_article_specialty_tags", {
      p_article_id: articleId,
      p_tags:       specialty_tags,
      p_status:     article.status ?? "pending",
    });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    void logArticleEvent(articleId, "status_changed", {
      type:       "specialty_tags",
      from:       (article.specialty_tags as string[] | null) ?? [],
      to:         specialty_tags,
      changed_by: auth.userId,
    });
  }

  // Update subspecialty_ai
  if (subspecialty_ai !== undefined) {
    const { error } = await admin.from("articles").update({ subspecialty_ai } as never).eq("id", articleId);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  // Update status
  if (status !== undefined) {
    const { error } = await admin.from("articles").update({ status }).eq("id", articleId);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    void logArticleEvent(articleId, "status_changed", {
      from:       article.status ?? null,
      to:         status,
      changed_by: auth.userId,
    });
  }

  return NextResponse.json({ ok: true });
}
