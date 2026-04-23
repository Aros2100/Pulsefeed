import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import pLimit from "p-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { getActivePrompt, scoreCondensation, type ActivePrompt } from "@/lib/lab/scorer";

const CONCURRENCY = 1;
const DELAY_MS    = 1300;
const BATCH_LIMIT = 10;

const schema = z.object({
  specialty: z.string().refine(
    (v) => v === ACTIVE_SPECIALTY,
    { message: "Invalid specialty" }
  ),
});

type Article = { id: string; title: string; abstract: string | null };

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

  let activePrompt: ActivePrompt;
  try {
    activePrompt = await getActivePrompt(specialty, "condensation_text");
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 422 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcArticles, error: rpcError } = await (admin as any).rpc(
    "get_text_unscored_articles",
    { p_specialty: specialty, p_limit: BATCH_LIMIT },
  );
  if (rpcError) return NextResponse.json({ ok: false, error: rpcError.message }, { status: 500 });
  const toScore = (rpcArticles ?? []) as Article[];

  if (toScore.length === 0) {
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
                await new Promise((r) => setTimeout(r, DELAY_MS));
                const condensation = await scoreCondensation(article, specialty, activePrompt, "condensation_text");
                const updatePayload = {
                  short_headline:          condensation.short_headline,
                  short_resume:            condensation.short_resume,
                  bottom_line:             condensation.bottom_line,
                  condensed_model_version: condensation.version,
                  condensed_at:            new Date().toISOString(),
                };
                const { error } = await admin
                  .from("articles")
                  .update(updatePayload)
                  .eq("id", article.id);
                if (error) throw new Error(error.message);
                void admin.from("article_events").insert({
                  article_id: article.id,
                  event_type: "condensation_text_scored",
                  meta: { version: condensation.version },
                });
                scored++;
              } catch (e) {
                console.error(`[score-condensation-text] failed article ${article.id}:`, e);
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
