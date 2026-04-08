import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logArticleEvent } from "@/lib/article-events";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

const FIXED_SPECIALTY = ACTIVE_SPECIALTY;

const schema = z.object({
  verdicts: z.array(z.object({
    article_id:          z.string().uuid(),
    decision:            z.string(),
    ai_decision:         z.string(),
    corrected:           z.boolean(),
    ai_confidence:       z.number().nullable().optional(),
    disagreement_reason: z.string().nullable().optional(),
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

  const { verdicts } = result.data;
  const admin = createAdminClient();

  // Fetch active model version for article_type
  const { data: activeVersion } = await admin
    .from("model_versions")
    .select("version")
    .eq("specialty", FIXED_SPECIALTY)
    .eq("module", "article_type")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  const modelVersion = (activeVersion?.version as string | null) ?? null;

  // 1. Create lab_session row
  const { data: session, error: sessionError } = await admin
    .from("lab_sessions")
    .insert({
      specialty:         FIXED_SPECIALTY,
      module:            "article_type",
      user_id:           null,
      completed_at:      new Date().toISOString(),
      articles_reviewed: verdicts.length,
      articles_approved: 0,
      articles_rejected: 0,
    })
    .select("id")
    .single();

  if (sessionError) {
    console.error("[article-type-sessions] lab_sessions insert error:", sessionError);
    return NextResponse.json({ ok: false, error: sessionError.message }, { status: 500 });
  }

  const sessionId = session.id as string;

  // 2. Insert 1 lab_decision per verdict
  const decisionRows = verdicts.map((v) => ({
    session_id:          sessionId,
    article_id:          v.article_id,
    specialty:           FIXED_SPECIALTY,
    module:              "article_type",
    decision:            v.decision,
    ai_decision:         v.ai_decision,
    ai_confidence:       v.ai_confidence ?? null,
    disagreement_reason: v.disagreement_reason ?? (v.corrected ? "corrected" : null),
    model_version:       modelVersion,
  }));

  const { error: decisionsError } = await admin.from("lab_decisions").insert(decisionRows);
  if (decisionsError) {
    console.error("[article-type-sessions] lab_decisions insert error:", decisionsError);
    return NextResponse.json({ ok: false, error: decisionsError.message }, { status: 500 });
  }

  // 3. Update articles: set article_type + article_type_validated on all verdicts;
  //    for corrected ones also update article_type_ai to the chosen decision.
  for (const v of verdicts) {
    const update: Record<string, unknown> = {
      article_type:           v.decision,
      article_type_validated: true,
    };
    if (v.corrected) {
      update.article_type_ai = v.decision;
    }
    await admin.from("articles").update(update).eq("id", v.article_id);
  }

  // Fire-and-forget: log article events
  void Promise.all(
    verdicts.map((v) =>
      logArticleEvent(v.article_id, "lab_decision", {
        module:       "article_type",
        article_type: v.decision,
      })
    )
  );

  return NextResponse.json({
    ok: true,
    sessionId,
    reviewed: verdicts.length,
  });
}
