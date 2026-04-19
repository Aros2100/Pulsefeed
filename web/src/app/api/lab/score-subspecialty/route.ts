import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import pLimit from "p-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { getActivePrompt, scoreSubspecialtyLab, type ActivePrompt } from "@/lib/lab/scorer";

const CONCURRENCY  = 1;
const DELAY_MS     = 1300;
const BATCH_LIMIT  = 50;

const schema = z.object({
  specialty: z.string().refine(
    (v) => v === ACTIVE_SPECIALTY,
    { message: "Invalid specialty" }
  ),
  scoreAll: z.boolean().optional().default(false),
});

type Article = { id: string; title: string; abstract: string | null };

async function classifyWithDelay(
  article: Article,
  specialty: string,
  activePrompt: ActivePrompt
) {
  await new Promise((r) => setTimeout(r, DELAY_MS));
  return classifyWithRetry(article, specialty, activePrompt);
}

async function classifyWithRetry(
  article: Article,
  specialty: string,
  activePrompt: ActivePrompt,
  retries = 3
) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      console.log("[score-subspecialty] article id:", article.id);
      return await scoreSubspecialtyLab(article, specialty, activePrompt, "subspecialty_lab");
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 429 && attempt < retries - 1) {
        const waitMs = (attempt + 1) * 60_000;
        console.warn(`[score-subspecialty] rate limited — waiting ${waitMs / 1000}s before retry ${attempt + 1}/${retries - 1}`);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  let activePrompt;
  try {
    activePrompt = await getActivePrompt(specialty, "subspecialty");
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 422 });
  }

  let articles: Article[] | null;
  let fetchError: { message: string } | null;

  if (scoreAll) {
    // Re-score articles where subspecialty_ai is NULL and not yet validated
    const { data: rescoreIds } = await admin.rpc("get_subspecialty_rescore_candidates", {
      p_specialty: specialty,
      p_limit: 50,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidateIds: string[] = ((rescoreIds ?? []) as any[]).map((r) => r.id ?? r);

    const res = await admin
      .from("articles")
      .select("id, title, abstract")
      .in("id", candidateIds.length > 0 ? candidateIds : ["00000000-0000-0000-0000-000000000000"])
      .limit(50);
    articles = res.data as Article[] | null;
    fetchError = res.error;
  } else {
    // Normal Lab-scoring: fill up to BATCH_LIMIT
    const { data: alreadyScoredCount } = await admin.rpc(
      "count_subspecialty_not_validated",
      { p_specialty: specialty },
    );
    const existing = Number(alreadyScoredCount ?? 0);
    const remaining = Math.max(0, BATCH_LIMIT - existing);

    if (remaining === 0) {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, scored: 0, failed: 0, total: 0 })}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "Content-Encoding": "none", "X-Accel-Buffering": "no" },
      });
    }

    const { data: unscoredData, error: unscoredError } = await admin.rpc(
      "get_subspecialty_unscored_articles",
      { p_specialty: specialty, p_limit: remaining }
    );
    articles = unscoredData as Article[] | null;
    fetchError = unscoredError;
  }

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  const toScore = (articles ?? []) as Article[];

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
                const cls = await classifyWithDelay(article, specialty, activePrompt!);
                const { error } = await admin
                  .from("articles")
                  .update({
                    subspecialty_ai:              cls.subspecialty,
                    subspecialty_reason:        cls.reason,
                    subspecialty_model_version: cls.version,
                    subspecialty_scored_at:     new Date().toISOString(),
                  })
                  .eq("id", article.id);
                if (error) throw new Error(error.message);
                scored++;
              } catch (e) {
                const status = (e as { status?: number })?.status;
                const msg = (e as Error)?.message ?? String(e);
                console.error(`[score-subspecialty] failed article ${article.id} (status=${status}): ${msg}`);
                failedIds.push(article.id);
              }
              send({ scored, failed: failedIds.length, total: toScore.length });
            })
          )
        );

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
      "Content-Type":       "text/event-stream",
      "Cache-Control":      "no-cache",
      "Connection":         "keep-alive",
      "Content-Encoding":   "none",
      "X-Accel-Buffering":  "no",
    },
  });
}
