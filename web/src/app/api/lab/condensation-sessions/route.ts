import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { logArticleEvent } from "@/lib/article-events";
import { getActivePrompt } from "@/lib/lab/scorer";

const schema = z.object({
  specialty: z.string().refine(
    (v) => v === ACTIVE_SPECIALTY,
    { message: "Invalid specialty" }
  ),
  module: z.enum(["condensation_text", "condensation_pico", "condensation_sari"]),
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

  // Fetch the active prompt version for this module — avoids reading from articles
  // where sari_model_version / text_model_version is NULL until after approval.
  let activeVersion: string;
  try {
    const activePrompt = await getActivePrompt(specialty, module);
    activeVersion = activePrompt.version;
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 422 });
  }

  // 1. Create lab_session row
  const { data: session, error: sessionError } = await admin
    .from("lab_sessions")
    .insert({
      specialty,
      module,
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
  const decisionRows = decisions.map((d) => ({
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
    model_version:       activeVersion,
  }));

  const { error: decisionsError } = await admin.from("lab_decisions").insert(decisionRows);
  if (decisionsError) {
    console.error("[condensation-sessions] lab_decisions insert error:", decisionsError);
    return NextResponse.json({ ok: false, error: decisionsError.message }, { status: 500 });
  }

  // Write metadata to articles only for approved decisions (approved-only principle)
  const approvedIds = decisions.filter((d) => d.decision === "approved").map((d) => d.article_id);
  if (approvedIds.length > 0) {
    const now = new Date().toISOString();
    void Promise.all(
      approvedIds.map((articleId) => {
        const update =
          module === "condensation_sari"
            ? { sari_condensed_at: now, sari_model_version: activeVersion }
            : { text_condensed_at: now, text_model_version: activeVersion };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (admin as any).from("articles").update(update).eq("id", articleId)
          .then(({ error }: { error: { message: string } | null }) => {
            if (error) console.error(`[condensation-sessions] metadata update failed for ${articleId}:`, error.message);
          });
      })
    );
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

  void Promise.all(
    decisions.map((d) =>
      admin.from("article_events").insert({
        article_id: d.article_id,
        event_type: "condensation_validated",
        payload: { module, decision: d.decision },
      }).then(({ error }) => {
        if (error) console.error(`[condensation-sessions] article_events insert failed for ${d.article_id}:`, error.message);
      })
    )
  );

  return NextResponse.json({
    ok: true,
    sessionId,
    reviewed: decisions.length,
  });
}
