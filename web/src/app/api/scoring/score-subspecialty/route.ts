import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import pLimit from "p-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { getActivePrompt, scoreClassificationDrift, type ActivePrompt, type ClassificationDriftResult } from "@/lib/lab/scorer";
import { logArticleEvent } from "@/lib/article-events";

const CONCURRENCY  = 1;
const DELAY_MS     = 1300;

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
      console.log("[scoring/score-subspecialty] article id:", article.id);
      return await scoreClassificationDrift(article, specialty, activePrompt);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 429 && attempt < retries - 1) {
        const waitMs = (attempt + 1) * 60_000;
        console.warn(`[scoring/score-subspecialty] rate limited — waiting ${waitMs / 1000}s before retry ${attempt + 1}/${retries - 1}`);
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

  const { specialty, limit, edat_from, edat_to } = result.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  let activePrompt;
  try {
    activePrompt = await getActivePrompt(specialty, "subspecialty");
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 422 });
  }

  const { data: unscoredData, error: fetchError } = await admin.rpc(
    "get_subspecialty_unscored_articles",
    {
      p_specialty: specialty,
      p_limit:     limit ?? 50,
      p_edat_from: edat_from ?? null,
      p_edat_to:   edat_to   ?? null,
    }
  );
  const toScore = (unscoredData ?? []) as Article[];

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

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
                    subspecialty:               cls.subspecialty,
                    subspecialty_ai:            cls.subspecialty,
                    subspecialty_model_version: cls.version,
                    subspecialty_scored_at:     new Date().toISOString(),
                  })
                  .eq("id", article.id);
                if (error) throw new Error(error.message);
                scored++;
                void logArticleEvent(article.id, "enriched", {
                  module:      "subspecialty",
                  subspecialty: cls.subspecialty,
                  version:     cls.version,
                });
              } catch (e) {
                const status = (e as { status?: number })?.status;
                const msg = (e as Error)?.message ?? String(e);
                console.error(`[scoring/score-subspecialty] failed article ${article.id} (status=${status}): ${msg}`);
                failedIds.push(article.id);
              }
              send({ scored, failed: failedIds.length, total: toScore.length });
            })
          )
        );

        send({ done: true, scored, failed: failedIds.length, total: toScore.length, approved: 0, rejected: 0 });
      } catch (e) {
        send({ done: true, error: String(e), scored, failed: failedIds.length, total: toScore.length, approved: 0, rejected: 0 });
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
