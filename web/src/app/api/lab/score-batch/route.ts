import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import pLimit from "p-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { getActivePrompt, scoreArticleLab, type ActivePrompt } from "@/lib/lab/scorer";
import { logArticleEvent } from "@/lib/article-events";

const CONCURRENCY  = 1;    // sequential to avoid bursting the 50 req/min limit
const DELAY_MS     = 1300; // 1300ms between requests ≈ 46 req/min, safely under 50

const schema = z.object({
  specialty: z.string().refine(
    (v) => v === ACTIVE_SPECIALTY,
    { message: "Invalid specialty" }
  ),
  scoreAll:  z.boolean().default(false),
  limit:     z.number().int().positive().optional(),
  edat_from: z.string().optional(),
  edat_to:   z.string().optional(),
});

type Article = { id: string; title: string; abstract: string | null };

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
      return await scoreArticleLab(article, specialty, activePrompt);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 429 && attempt < retries - 1) {
        const waitMs = (attempt + 1) * 60_000; // 60s, 120s, 180s
        console.warn(`[lab/score-batch] rate limited — waiting ${waitMs / 1000}s before retry ${attempt + 1}/${retries - 1}`);
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

  const { specialty, scoreAll, limit: userLimit, edat_from, edat_to } = result.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  let activePrompt;
  try {
    activePrompt = await getActivePrompt(specialty, "specialty_lab");
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 422 });
  }

  const v = activePrompt.version;

  // Fetch article IDs — scoreAll re-scores already-scored articles too
  let ids: string[];
  if (scoreAll) {
    const { data } = await admin
      .from("article_specialties")
      .select("article_id")
      .eq("specialty", specialty)
      .or(`specialty_match.is.null,scored_by.neq.${v}`);
    ids = (data ?? []).map((r: { article_id: string }) => r.article_id);
  } else {
    const { data } = await admin.rpc("get_specialty_scoring_candidates", {
      p_specialty: specialty,
      p_limit:     userLimit ?? 100,
      p_edat_from: edat_from ?? null,
      p_edat_to:   edat_to   ?? null,
    });
    ids = (data ?? []).map((r: { article_id: string }) => r.article_id);
  }

  if (ids.length === 0) {
    const emptyStream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, scored: 0, failed: 0, total: 0 })}\n\n`));
        controller.close();
      },
    });
    return new Response(emptyStream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "Content-Encoding": "none", "X-Accel-Buffering": "no" },
    });
  }

  const { data: articles, error: fetchError } = await admin
    .from("articles")
    .select("id, title, abstract")
    .in("id", ids);

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  const toScore = (articles ?? []) as Article[];

  // Stream SSE progress events so the client can show a live countdown
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      let scored = 0;
      let approved = 0;
      let rejected = 0;
      const failedIds: string[] = [];
      const limiter = pLimit(CONCURRENCY);

      try {
        await Promise.all(
          toScore.map((article) =>
            limiter(async () => {
              try {
                const score = await scoreWithDelay(article, specialty, activePrompt!);
                scored++;
                if (score.ai_decision === "approved") approved++; else rejected++;
                await admin
                  .from("article_specialties")
                  .update({
                    specialty_match:      score.ai_decision === "approved" ? true : false,
                    source:               "lab_ai",
                    scored_by:            score.version,
                    scored_at:            new Date().toISOString(),
                    specialty_confidence: score.confidence,
                    specialty_reason:     score.reason,
                  })
                  .eq("article_id", article.id)
                  .eq("specialty", specialty);
                void logArticleEvent(article.id, "enriched", {
                  specialty,
                  module:     "specialty_lab",
                  decision:   score.ai_decision,
                  confidence: score.confidence,
                  reason:     score.reason,
                  version:    score.version,
                });
              } catch (e) {
                console.error(`[lab/score-batch] failed article ${article.id}:`, e);
                failedIds.push(article.id);
              }
              // Emit progress after every article (success or failure)
              send({ scored, total: toScore.length });
            })
          )
        );

        send({ done: true, scored, approved, rejected, failed: failedIds.length, total: toScore.length });
      } catch (e) {
        send({ done: true, error: String(e), scored, approved, rejected, failed: failedIds.length, total: toScore.length });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache",
      "Connection":        "keep-alive",
      "Content-Encoding":  "none",
      "X-Accel-Buffering": "no",
    },
  });
}
