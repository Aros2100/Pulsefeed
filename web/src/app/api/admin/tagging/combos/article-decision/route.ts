import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logArticleEvent } from "@/lib/article-events";
import { z } from "zod";

const schema = z.object({
  articleId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  specialty: z.string(),
  matchedCombos: z.array(
    z.object({ term_1: z.string(), term_2: z.string() })
  ),
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

  const { articleId, decision, specialty, matchedCombos } = parsed.data;
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const updateFields: Record<string, unknown> = { status: decision };
  if (decision === "approved") {
    updateFields.approval_method = "mesh_combo_tag";
    updateFields.auto_tagged_at = now;
  }

  const { error } = await admin
    .from("articles")
    .update(updateFields)
    .eq("id", articleId)
    .eq("status", "pending");

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  await logArticleEvent(articleId, "auto_tagged", {
    source: "mesh_combo_tagging",
    decision,
    specialty,
    approved_by: auth.userId,
    matched_combos: matchedCombos,
  });

  return NextResponse.json({ ok: true });
}
