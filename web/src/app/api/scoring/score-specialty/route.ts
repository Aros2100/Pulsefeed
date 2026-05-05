import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import pLimit from "p-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { getActivePrompt, scoreArticle, type ActivePrompt } from "@/lib/lab/scorer";
import { logScoringEvent, type EventActor, type EventSource } from "@/lib/article-events";
import { startScoringRun, finishScoringRun, failScoringRun } from "@/lib/scoring-runs";

const CONCURRENCY  = 1;    // sequential to avoid bursting the 50 req/min limit
const DELAY_MS     = 1300; // 1300ms between requests ≈ 46 req/min, safely under 50

const schema = z.object({
  specialty: z.string().refine(
    (v) => v === ACTIVE_SPECIALTY,
    { message: "Invalid specialty" }
  ),
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
      return await scoreArticle(article, specialty, activePrompt);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 429 && attempt < retries - 1) {
        const waitMs = (attempt + 1) * 60_000; // 60s, 120s, 180s
        console.warn(`[scoring/score-specialty] rate limited — waiting ${waitMs / 1000}s before retry ${attempt + 1}/${retries - 1}`);
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

  const { specialty, limit: userLimit, edat_from, edat_to } = result.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  let activePrompt;
  try {
    activePrompt = await getActivePrompt(specialty, "specialty");
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 422 });
  }

  const { data: unscoredData, error: fetchError } = await admin.rpc("get_specialty_unscored_articles", {
    p_specialty: specialty,
    p_limit:     userLimit ?? 100,
    p_edat_from: edat_from ?? null,
    p_edat_to:   edat_to   ?? null,
  });

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  const toScore = (unscoredData ?? []) as Article[];

  const runId = await startScoringRun("specialty", specialty, activePrompt.version);

  if (toScore.length === 0) {
    void finishScoringRun(runId, 0, 0, 0);
    const emptyStream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, scored: 0, failed: 0, total: 0, approved: 0, rejected: 0 })}\n\n`));
        controller.close();
      },
    });
    return new Response(emptyStream, {
      headers: {
        "Content-Type":      "text/event-stream",
        "Cache-Control":     "no-cache",
        "Connection":        "keep-alive",
        "Content-Encoding":  "none",
        "X-Accel-Buffering": "no",
      },
    });
  }

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
                    specialty_match: score.ai_decision === "approved" ? true : false,
                    source:          "ai_score",
                    scored_by:       score.version,
                    scored_at:       new Date().toISOString(),
                  })
                  .eq("article_id", article.id)
                  .eq("specialty", specialty);
                void logScoringEvent(article.id, "specialty", {
                  actor:   `user:${auth.userId}` as EventActor,
                  source:  "manual" as EventSource,
                  version: score.version,
                  result:  { decision: score.ai_decision, specialty },
                });
              } catch (e) {
                console.error(`[scoring/score-specialty] failed article ${article.id}:`, e);
                failedIds.push(article.id);
              }
              // Emit progress after every article (success or failure)
              send({ scored, total: toScore.length });
            })
          )
        );

        send({ done: true, scored, approved, rejected, failed: failedIds.length, total: toScore.length });
        void finishScoringRun(runId, scored, failedIds.length, toScore.length);
      } catch (e) {
        send({ done: true, error: String(e), scored, approved, rejected, failed: failedIds.length, total: toScore.length });
        void failScoringRun(runId, String(e));
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
