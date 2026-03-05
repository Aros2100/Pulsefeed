import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import pLimit from "p-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTY_SLUGS } from "@/lib/auth/specialties";
import { getActivePrompt, scoreArticle, type ActivePrompt } from "@/lib/lab/scorer";
import { logArticleEvent } from "@/lib/article-events";

const CONCURRENCY  = 2;  // 2 concurrent × ~1s each ≈ 120 req/min — safely under 50 req/min limit
const BATCH_LIMIT  = 50; // score at most 50 articles per call (one minute's worth at 2 concurrent)

const schema = z.object({
  specialty: z.string().refine(
    (v) => (SPECIALTY_SLUGS as readonly string[]).includes(v),
    { message: "Invalid specialty" }
  ),
});

type Article = { id: string; title: string; abstract: string | null; specialty_tags: string[] | null };

async function scoreWithRetry(
  article: Article,
  specialty: string,
  activePrompt: ActivePrompt,
  retries = 3
) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await scoreArticle(article, specialty, activePrompt);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 429 && attempt < retries - 1) {
        const waitMs = (attempt + 1) * 60_000; // 60s, 120s, 180s
        console.warn(`[score-batch] rate limited — waiting ${waitMs / 1000}s before retry ${attempt + 1}/${retries - 1}`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

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

  // Fetch next BATCH_LIMIT unscored articles — don't attempt the entire queue at once.
  // Guard on BOTH fields: specialty_scored_at (primary) + specialty_confidence (fallback
  // before migration 0048 has been applied to all envs) to prevent re-scoring.
  const { data: articles, error: fetchError } = await admin
    .from("articles")
    .select("id, title, abstract, specialty_tags")
    .eq("status", "pending")
    .is("specialty_scored_at", null)
    .is("specialty_confidence", null)
    .order("circle", { ascending: false, nullsFirst: false })
    .limit(BATCH_LIMIT);

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  const toScore = articles ?? [];
  let scored = 0;
  const failedIds: string[] = [];

  // Process up to BATCH_LIMIT articles in parallel, capped at CONCURRENCY concurrent Claude calls
  const limiter = pLimit(CONCURRENCY);

  const results = await Promise.allSettled(
    toScore.map((article) =>
      limiter(async () => {
        const score = await scoreWithRetry(article, specialty, activePrompt);
        const { error } = await admin
          .from("articles")
          .update({
            specialty_confidence: score.confidence,
            ai_decision:          score.ai_decision,
            model_version:        score.version,
            specialty_scored_at:  new Date().toISOString(),
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
    )
  );

  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      scored++;
    } else {
      console.error(`[score-batch] failed article ${toScore[i].id}:`, r.reason);
      failedIds.push(toScore[i].id);
    }
  });

  // Mark failed articles with null confidence (not 0) so the UI shows "Not scored"
  // rather than "0% confident". Set specialty_scored_at so they aren't re-queued
  // on the next scoring run — a human can still decide them in the Lab.
  if (failedIds.length > 0) {
    const { error: fallbackError } = await admin
      .from("articles")
      .update({
        specialty_confidence: null,
        ai_decision:          null,
        specialty_scored_at:  new Date().toISOString(),
      })
      .in("id", failedIds);
    if (fallbackError) {
      console.error("[score-batch] fallback update error:", fallbackError);
    }
  }

  console.log(`[score-batch] done — scored: ${scored}, failed: ${failedIds.length}, total: ${toScore.length}`);
  return NextResponse.json({ ok: true, scored, failed: failedIds.length, total: toScore.length });
}
