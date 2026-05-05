import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logArticleEvent, type EventActor, type EventSource } from "@/lib/article-events";
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from("article_specialties")
    .update({
      specialty_match: decision === "approved" ? true : false,
      scored_by: "mesh_auto_tagging",
      scored_at: now,
    })
    .eq("article_id", articleId)
    .eq("specialty", specialty);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  if (decision === "approved") {
    await admin
      .from("articles")
      .update({ approval_method: "mesh_single_tag", auto_tagged_at: now })
      .eq("id", articleId);
  }

  await logArticleEvent(articleId, "auto_tagged", {
    actor:         `user:${auth.userId}` as EventActor,
    source:        "manual" as EventSource,
    module:        "specialty",
    method:        "mesh_single_tagging",
    result:        specialty,
    decision,
    matched_terms: matchedTerms,
  });

  return NextResponse.json({ ok: true });
}
