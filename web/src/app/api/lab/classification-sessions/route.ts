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
  verdicts: z.array(z.object({
    article_id:  z.string().uuid(),
    decision:    z.string(),
    ai_decision: z.string(),
    corrected:   z.boolean(),
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

  const { specialty, verdicts } = result.data;
  const admin = createAdminClient();

  // Fetch active model version for classification
  const { data: activeVersion } = await admin
    .from("model_versions")
    .select("version")
    .eq("specialty", specialty)
    .eq("module", "classification")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  const modelVersion = (activeVersion?.version as string | null) ?? null;

  // 1. Create lab_session row
  const { data: session, error: sessionError } = await admin
    .from("lab_sessions")
    .insert({
      specialty,
      module: "classification",
      user_id: null,
      completed_at: new Date().toISOString(),
      articles_reviewed: verdicts.length,
      articles_approved: 0,
      articles_rejected: 0,
    })
    .select("id")
    .single();

  if (sessionError) {
    console.error("[classification-sessions] lab_sessions insert error:", sessionError);
    return NextResponse.json({ ok: false, error: sessionError.message }, { status: 500 });
  }

  const sessionId = session.id as string;

  // 2. Insert 1 lab_decision per verdict
  const decisionRows = verdicts.map((v) => ({
    session_id:          sessionId,
    article_id:          v.article_id,
    specialty,
    module:              "classification_subspecialty",
    decision:            v.decision,
    ai_decision:         v.ai_decision,
    ai_confidence:       null,
    disagreement_reason: v.corrected ? "corrected" : null,
    model_version:       modelVersion,
  }));

  const { error: decisionsError } = await admin.from("lab_decisions").insert(decisionRows);
  if (decisionsError) {
    console.error("[classification-sessions] lab_decisions insert error:", decisionsError);
    return NextResponse.json({ ok: false, error: decisionsError.message }, { status: 500 });
  }

  // Fire-and-forget: log article events
  void Promise.all(
    verdicts.map((v) =>
      logArticleEvent(v.article_id, "lab_decision", {
        module: "classification",
        subspecialty: v.decision,
      })
    )
  );

  return NextResponse.json({
    ok: true,
    sessionId,
    reviewed: verdicts.length,
  });
}
