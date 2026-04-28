import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import pLimit from "p-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { getActivePrompt, scoreSari, type ActivePrompt } from "@/lib/lab/scorer";
import { logArticleEvent } from "@/lib/article-events";
import { startScoringRun, finishScoringRun, failScoringRun } from "@/lib/scoring-runs";

const CONCURRENCY = 1;
const DELAY_MS    = 1300;

const schema = z.object({
  specialty: z.string().refine(
    (v) => v === ACTIVE_SPECIALTY,
    { message: "Invalid specialty" }
  ),
  limit:     z.number().int().positive().optional(),
  edat_from: z.string().optional(),
  edat_to:   z.string().optional(),
});

type RpcArticle = { id: string; title: string; abstract: string | null };
type FullArticle = RpcArticle & {
  short_headline: string | null;
  short_resume:   string | null;
  bottom_line:    string | null;
};

async function scoreWithDelay(article: FullArticle, activePrompt: ActivePrompt) {
  await new Promise((r) => setTimeout(r, DELAY_MS));
  return scoreWithRetry(article, activePrompt);
}

async function scoreWithRetry(article: FullArticle, activePrompt: ActivePrompt, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await scoreSari(article, activePrompt);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 429 && attempt < retries - 1) {
        const waitMs = (attempt + 1) * 60_000;
        console.warn(`[scoring/score-condensation-sari] rate limited — waiting ${waitMs / 1000}s before retry ${attempt + 1}/${retries - 1}`);
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
    activePrompt = await getActivePrompt(specialty, "condensation_sari");
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 422 });
  }

  const { data: unscoredData, error: fetchError } = await admin.rpc(
    "get_sari_unscored_articles",
    {
      p_specialty: specialty,
      p_limit:     limit ?? 50,
      p_edat_from: edat_from ?? null,
      p_edat_to:   edat_to   ?? null,
    }
  );

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  const rpcArticles = (unscoredData ?? []) as RpcArticle[];

  // Fetch condensation fields needed by the SARI prompt
  let toScore: FullArticle[] = [];
  if (rpcArticles.length > 0) {
    const ids = rpcArticles.map((a) => a.id);
    const { data: condensationRows } = await admin
      .from("articles")
      .select("id, short_headline, short_resume, bottom_line")
      .in("id", ids);

    const condMap = Object.fromEntries(
      ((condensationRows ?? []) as { id: string; short_headline: string | null; short_resume: string | null; bottom_line: string | null }[])
        .map((r) => [r.id, r])
    );
    toScore = rpcArticles.map((a) => ({
      ...a,
      short_headline: condMap[a.id]?.short_headline ?? null,
      short_resume:   condMap[a.id]?.short_resume   ?? null,
      bottom_line:    condMap[a.id]?.bottom_line     ?? null,
    }));
  }

  const runId = await startScoringRun("condensation_sari", specialty, activePrompt.version);

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
                const sari = await scoreWithDelay(article, activePrompt!);
                const { error } = await admin
                  .from("articles")
                  .update({
                    sari_subject:       sari.sari_subject,
                    sari_action:        sari.sari_action,
                    sari_result:        sari.sari_result,
                    sari_implication:   sari.sari_implication,
                    sample_size:        sari.sample_size,
                    sari_model_version: sari.version,
                    sari_condensed_at:  new Date().toISOString(),
                  })
                  .eq("id", article.id);
                if (error) throw new Error(error.message);
                scored++;
                void logArticleEvent(article.id, "condensation_sari_scored", {
                  module:  "condensation_sari",
                  version: sari.version,
                });
              } catch (e) {
                const status = (e as { status?: number })?.status;
                const msg = (e as Error)?.message ?? String(e);
                console.error(`[scoring/score-condensation-sari] failed article ${article.id} (status=${status}): ${msg}`);
                failedIds.push(article.id);
              }
              send({ scored, failed: failedIds.length, total: toScore.length });
            })
          )
        );

        send({ done: true, scored, failed: failedIds.length, total: toScore.length, approved: 0, rejected: 0 });
        void finishScoringRun(runId, scored, failedIds.length, toScore.length);
      } catch (e) {
        send({ done: true, error: String(e), scored, failed: failedIds.length, total: toScore.length, approved: 0, rejected: 0 });
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
