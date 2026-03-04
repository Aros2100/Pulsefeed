import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTY_SLUGS } from "@/lib/auth/specialties";
import { getActivePrompt, scoreArticle } from "@/lib/lab/scorer";
import { logArticleEvent } from "@/lib/article-events";

const BATCH_SIZE = 10;

const schema = z.object({
  specialty: z.string().refine(
    (v) => (SPECIALTY_SLUGS as readonly string[]).includes(v),
    { message: "Invalid specialty" }
  ),
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

  const { specialty } = result.data;
  const admin = createAdminClient();

  // Fetch active prompt once for the whole batch (throws if not found)
  let activePrompt;
  try {
    activePrompt = await getActivePrompt(specialty, "specialty_tag");
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 422 });
  }

  // Find articles that have never been scored.
  // Guard on BOTH fields: specialty_scored_at (primary) + specialty_confidence (fallback
  // before migration 0048 has been applied to all envs) to prevent re-scoring.
  const { data: articles, error: fetchError } = await admin
    .from("articles")
    .select("id, title, abstract, specialty_tags")
    .eq("status", "pending")
    .is("specialty_scored_at", null)
    .is("specialty_confidence", null);

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  const toScore = articles ?? [];
  let scored = 0;
  const failedIds: string[] = [];

  // Process in parallel batches
  for (let i = 0; i < toScore.length; i += BATCH_SIZE) {
    const batch = toScore.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (article) => {
        const score = await scoreArticle(article, specialty, activePrompt);
        const { error } = await admin
          .from("articles")
          .update({
            specialty_confidence: score.confidence,
            ai_decision: score.ai_decision,
            model_version: score.version,
            specialty_scored_at: new Date().toISOString(),
          })
          .eq("id", article.id);
        if (error) throw new Error(error.message);
        void logArticleEvent(article.id, "enriched", {
          ai_decision:          score.ai_decision,
          specialty_confidence: score.confidence,
          model_version:        score.version,
          specialty_tags:       article.specialty_tags,
        });
        return score;
      })
    );
    results.forEach((r, j) => {
      const article = batch[j];
      if (r.status === "fulfilled") {
        scored++;
      } else {
        console.error(`[score-batch] failed article ${article.id}:`, r.reason);
        failedIds.push(article.id);
      }
    });
  }

  // Mark failed articles as uncertain so they don't get stuck unscored
  if (failedIds.length > 0) {
    const { error: fallbackError } = await admin
      .from("articles")
      .update({ specialty_confidence: 0, ai_decision: "uncertain" })
      .in("id", failedIds);
    if (fallbackError) {
      console.error("[score-batch] fallback update error:", fallbackError);
    }
  }

  console.log(`[score-batch] done — scored: ${scored}, failed: ${failedIds.length}, total: ${toScore.length}`);
  return NextResponse.json({ ok: true, scored, failed: failedIds.length, total: toScore.length });
}
