import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logArticleEvent } from "@/lib/article-events";
import { z } from "zod";

const schema = z.object({
  articleId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  specialty: z.string(),
  matchedTerms: z.array(z.string()),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid input" },
      { status: 400 }
    );
  }

  const { articleId, decision, specialty, matchedTerms } = parsed.data;
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const updateFields: Record<string, unknown> = { status: decision };
  if (decision === "approved") {
    updateFields.approval_method = "mesh_single_tag";
    updateFields.auto_tagged_at = now;
  }

  const { error } = await admin
    .from("articles")
    .update(updateFields as never)
    .eq("id", articleId)
    .eq("status", "pending");

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  await logArticleEvent(articleId, "auto_tagged", {
    source: "mesh_single_tagging",
    decision,
    specialty,
    approved_by: auth.userId,
    matched_terms: matchedTerms,
  });

  return NextResponse.json({ ok: true });
}
