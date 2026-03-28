import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTY_SLUGS } from "@/lib/auth/specialties";
import { logArticleEvent } from "@/lib/article-events";

const schema = z.object({
  specialty: z.string().refine(
    (v) => (SPECIALTY_SLUGS as readonly string[]).includes(v),
    { message: "Invalid specialty" }
  ),
  module: z.enum(["condensation_text", "condensation_pico"]),
  decisions: z.array(z.object({
    article_id:     z.string().uuid(),
    decision:       z.enum(["approved", "rejected"]),
    comment:        z.string().optional().default(""),
    reject_reasons: z.array(z.string()).optional().default([]),
  })).min(1),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }

  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
  }

  const { specialty, module, decisions } = result.data;
  const admin = createAdminClient();

  // Fetch condensed_model_version for each article
  const articleIds = decisions.map((d) => d.article_id);
  const { data: articleRows } = await admin
    .from("articles")
    .select("id, condensed_model_version")
    .in("id", articleIds);

  const versionMap = new Map(
    ((articleRows ?? []) as unknown as { id: string; condensed_model_version: string | null }[])
      .map((r) => [r.id, r.condensed_model_version])
  );

  // 1. Create lab_session row
  const { data: session, error: sessionError } = await admin
    .from("lab_sessions")
    .insert({
      specialty,
      module: "condensation",
      user_id: null,
      completed_at: new Date().toISOString(),
      articles_reviewed: decisions.length,
      articles_approved: 0,
      articles_rejected: 0,
    })
    .select("id")
    .single();

  if (sessionError) {
    console.error("[condensation-sessions] lab_sessions insert error:", sessionError);
    return NextResponse.json({ ok: false, error: sessionError.message }, { status: 500 });
  }

  const sessionId = session.id as string;

  // 2. Insert 1 lab_decision per article for the specified module
  const decisionRows = decisions.map((d) => {
    const modelVersion = versionMap.get(d.article_id) ?? null;
    return {
      session_id:          sessionId,
      article_id:          d.article_id,
      specialty,
      module,
      decision:            d.decision,
      comment:             d.comment,
      ai_decision:         "approved",
      ai_confidence:       null,
      disagreement_reason: null,
      reject_reasons:      d.reject_reasons,
      model_version:       modelVersion,
    };
  });

  const { error: decisionsError } = await admin.from("lab_decisions").insert(decisionRows);
  if (decisionsError) {
    console.error("[condensation-sessions] lab_decisions insert error:", decisionsError);
    return NextResponse.json({ ok: false, error: decisionsError.message }, { status: 500 });
  }

  // Fire-and-forget: log article events
  void Promise.all(
    decisions.map((d) =>
      logArticleEvent(d.article_id, "lab_decision", {
        module,
        decision: d.decision,
      })
    )
  );

  return NextResponse.json({
    ok: true,
    sessionId,
    reviewed: decisions.length,
  });
}
