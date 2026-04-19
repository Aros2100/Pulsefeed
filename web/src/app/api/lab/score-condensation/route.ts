import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import pLimit from "p-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { getActivePrompt, scoreCondensation, type ActivePrompt } from "@/lib/lab/scorer";

const CONCURRENCY  = 1;
const DELAY_MS     = 1300;
const BATCH_LIMIT  = 10;

const schema = z.object({
  specialty: z.string().refine(
    (v) => v === ACTIVE_SPECIALTY,
    { message: "Invalid specialty" }
  ),
});

type Article = { id: string; title: string; abstract: string | null };

async function condenseWithDelay(
  article: Article,
  specialty: string,
  activePrompt: ActivePrompt
) {
  await new Promise((r) => setTimeout(r, DELAY_MS));
  return condenseWithRetry(article, specialty, activePrompt);
}

async function condenseWithRetry(
  article: Article,
  specialty: string,
  activePrompt: ActivePrompt,
  retries = 3
) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await scoreCondensation(article, specialty, activePrompt, "condensation");
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 429 && attempt < retries - 1) {
        const waitMs = (attempt + 1) * 60_000;
        console.warn(`[score-condensation] rate limited — waiting ${waitMs / 1000}s before retry ${attempt + 1}/${retries - 1}`);
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

  let activePrompt;
  try {
    activePrompt = await getActivePrompt(specialty, "condensation");
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 422 });
  }

  const { data: alreadyScoredCount } = await admin.rpc(
    "count_condensation_not_validated",
    { p_specialty: specialty },
  );
  const existing  = Number(alreadyScoredCount ?? 0);
  const remaining = Math.max(0, BATCH_LIMIT - existing);

  let toScore: Article[];

  if (remaining === 0) {
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
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcArticles, error: rpcError } = await (admin as any).rpc(
      "get_condensation_unscored_articles",
      { p_specialty: specialty, p_limit: remaining },
    );
    if (rpcError) return NextResponse.json({ ok: false, error: rpcError.message }, { status: 500 });
    toScore = (rpcArticles ?? []) as Article[];
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
                const cnd = await condenseWithDelay(article, specialty, activePrompt!);
                const updatePayload = {
                  short_headline:          cnd.short_headline,
                  short_resume:            cnd.short_resume,
                  bottom_line:             cnd.bottom_line,
                  sari_subject:            cnd.sari_subject,
                  sari_action:             cnd.sari_action,
                  sari_result:             cnd.sari_result,
                  sari_implication:        cnd.sari_implication,
                  sample_size:             cnd.sample_size,
                  condensed_model_version: cnd.version,
                  condensed_at:            new Date().toISOString(),
                };
                const { data, error } = await admin
                  .from("articles")
                  .update(updatePayload)
                  .eq("id", article.id);
                if (error) throw new Error(error.message);
                void admin.from("article_events").insert({
                  article_id: article.id,
                  event_type: "condensation_scored",
                  meta: { version: cnd.version },
                });
                scored++;
              } catch (e) {
                console.error(`[score-condensation] failed article ${article.id}:`, e);
                failedIds.push(article.id);
              }
              send({ scored, total: toScore.length });
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
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
