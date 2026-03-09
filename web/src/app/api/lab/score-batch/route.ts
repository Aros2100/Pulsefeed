import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import pLimit from "p-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTY_SLUGS } from "@/lib/auth/specialties";
import { getActivePrompt, scoreArticle, type ActivePrompt } from "@/lib/lab/scorer";
import { logArticleEvent } from "@/lib/article-events";

const CONCURRENCY  = 1;    // sequential to avoid bursting the 50 req/min limit
const DELAY_MS     = 1300; // 1300ms between requests ≈ 46 req/min, safely under 50
const BATCH_LIMIT  = 100;  // score at most 100 articles per call (~130s total)

const schema = z.object({
  specialty: z.string().refine(
    (v) => (SPECIALTY_SLUGS as readonly string[]).includes(v),
    { message: "Invalid specialty" }
  ),
  scoreAll: z.boolean().default(false),
});

type Article = { id: string; title: string; abstract: string | null; specialty_tags: string[] | null };

async function scoreWithDelay(
  article: Article,
  specialty: string,
  activePrompt: ActivePrompt
) {
  await new Promise((r) => setTimeout(r, DELAY_MS));
  return scoreWithRetry(article, specialty, activePrompt);
}

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

  const { specialty, scoreAll } = result.data;
  const admin = createAdminClient();

  let activePrompt;
  try {
    activePrompt = await getActivePrompt(specialty, "specialty_tag");
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 422 });
  }

  // Count how many scored-but-not-validated articles already exist.
  // Only score enough new articles to fill up to BATCH_LIMIT (100).
  const { data: alreadyScoredCount } = await admin.rpc(
    "count_scored_not_validated" as never,
    { p_specialty: specialty } as never,
  );
  const existing = Number(alreadyScoredCount ?? 0);
  const remaining = Math.max(0, BATCH_LIMIT - existing);

  if (!scoreAll && remaining === 0) {
    // Already have ≥100 scored articles waiting for validation — nothing to score
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, scored: 0, failed: 0, total: 0 })}\n\n`));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
    });
  }

  const baseQuery = admin
    .from("articles")
    .select("id, title, abstract, specialty_tags")
    .eq("status", "pending")
    .contains("specialty_tags", [specialty])
    .order("circle", { ascending: false, nullsFirst: false });

  const v = activePrompt.version;
  const { data: articles, error: fetchError } = scoreAll
    // scoreAll=true (model activation): re-score articles with different/null model version.
    ? await baseQuery
        .or(`specialty_scored_at.is.null,model_version.is.null,model_version.neq.${v}`)
        .limit(BATCH_LIMIT)
    // scoreAll=false (normal): only unscored articles, fill up to remaining slots.
    : await baseQuery
        .is("specialty_confidence", null)
        .limit(remaining);

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  const toScore = articles ?? [];

  // Stream SSE progress events so the client can show a live countdown
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      let scored = 0;
      const failedIds: string[] = [];
      const limiter = pLimit(CONCURRENCY);

      try {
        await Promise.all(
          toScore.map((article) =>
            limiter(async () => {
              try {
                const score = await scoreWithDelay(article, specialty, activePrompt!);
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
                scored++;
              } catch (e) {
                console.error(`[score-batch] failed article ${article.id}:`, e);
                failedIds.push(article.id);
              }
              // Emit progress after every article (success or failure)
              send({ scored, total: toScore.length });
            })
          )
        );

        // Mark failed articles with null confidence so UI shows "Not scored"
        if (failedIds.length > 0) {
          await admin
            .from("articles")
            .update({
              specialty_confidence: null,
              ai_decision:          null,
              specialty_scored_at:  new Date().toISOString(),
            })
            .in("id", failedIds);
        }

        console.log(`[score-batch] done — scored: ${scored}, failed: ${failedIds.length}, total: ${toScore.length}`);
        send({ done: true, scored, failed: failedIds.length, total: toScore.length });
      } catch (e) {
        send({ done: true, error: String(e), scored, failed: failedIds.length, total: toScore.length });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
