import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTY_SLUGS } from "@/lib/auth/specialties";
import { logArticleEvent } from "@/lib/article-events";

const TAG_REMAP: Record<string, string> = {
  "Neuroscience":        "neuroscience",
  "Basic neuro research": "basic_neuro_research",
};

const schema = z.object({
  article_id: z.string().uuid(),
  specialty: z.string().refine((v) => (SPECIALTY_SLUGS as readonly string[]).includes(v), {
    message: "Invalid specialty",
  }),
  editor_verdict: z.enum(["relevant", "not_relevant", "unsure"]),
  ai_verdict: z.enum(["relevant", "not_relevant", "unsure"]).nullable().optional(),
  ai_confidence: z.number().int().min(0).max(100).nullable().optional(),
  disagreement_reason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { ok: false, error: result.error.issues[0].message },
      { status: 400 }
    );
  }

  const { article_id, specialty, editor_verdict, ai_verdict, ai_confidence, disagreement_reason } =
    result.data;

  const admin = createAdminClient();

  const { error: insertError } = await admin.from("lab_decisions").insert({
    article_id,
    specialty,
    module: "specialty_tags",
    decision: editor_verdict,
    ai_decision: ai_verdict ?? null,
    ai_confidence: ai_confidence ?? null,
    disagreement_reason: disagreement_reason ?? null,
  });

  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  void logArticleEvent(article_id, "lab_decision", {
    module:              "specialty_tags",
    editor_verdict,
    ai_verdict:          ai_verdict ?? null,
    confidence:          ai_confidence ?? null,
    disagreement_reason: disagreement_reason ?? null,
  });

  if (editor_verdict === "relevant" || editor_verdict === "not_relevant") {
    // Fetch old values before updating so we can record the transition
    const { data: oldArticle } = await admin
      .from("articles")
      .select("status, verified, specialty_tags")
      .eq("id", article_id)
      .maybeSingle();

    if (editor_verdict === "relevant") {
      const { error: updateError } = await admin
        .from("articles")
        .update({ specialty_tags: [specialty], verified: true, status: "approved" })
        .eq("id", article_id);
      if (updateError) {
        return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
      }
      void Promise.all([
        logArticleEvent(article_id, "status_changed", { from: oldArticle?.status ?? null, to: "approved", changed_by: auth.userId }),
        logArticleEvent(article_id, "verified",        { from: oldArticle?.verified ?? null, to: true,      changed_by: auth.userId }),
      ]);
    } else {
      const remapTag = disagreement_reason ? TAG_REMAP[disagreement_reason] : undefined;
      const oldTags  = (oldArticle?.specialty_tags ?? []) as string[];
      const newTags  = remapTag
        ? [...new Set(oldTags.filter((t) => t !== "neurosurgery").concat(remapTag))]
        : undefined;

      const { error: updateError } = await admin
        .from("articles")
        .update({ verified: false, status: "rejected", ...(newTags ? { specialty_tags: newTags } : {}) })
        .eq("id", article_id);
      if (updateError) {
        return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
      }
      void Promise.all([
        logArticleEvent(article_id, "status_changed", { from: oldArticle?.status ?? null, to: "rejected", changed_by: auth.userId }),
        logArticleEvent(article_id, "verified",        { from: oldArticle?.verified ?? null, to: false,    changed_by: auth.userId }),
      ]);
    }
  }
  // unsure: no article update

  return NextResponse.json({ ok: true });
}
