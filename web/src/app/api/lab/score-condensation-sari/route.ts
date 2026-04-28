import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import pLimit from "p-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { getActivePrompt, scoreSari, type ActivePrompt } from "@/lib/lab/scorer";

const CONCURRENCY = 1;
const DELAY_MS    = 1300;
const BATCH_LIMIT = 10;

const schema = z.object({
  specialty: z.string().refine(
    (v) => v === ACTIVE_SPECIALTY,
    { message: "Invalid specialty" }
  ),
});

type RpcArticle  = { id: string; title: string; abstract: string | null };
type FullArticle = RpcArticle & { short_headline: string | null; short_resume: string | null; bottom_line: string | null };

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
    activePrompt = await getActivePrompt(specialty, "condensation_sari");
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 422 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcArticles, error: rpcError } = await (admin as any).rpc(
    "get_sari_unscored_articles",
    { p_specialty: specialty, p_limit: BATCH_LIMIT, p_edat_from: null, p_edat_to: null },
  );
  if (rpcError) return NextResponse.json({ ok: false, error: rpcError.message }, { status: 500 });
  const rpcRows = (rpcArticles ?? []) as RpcArticle[];

  // Fetch condensation fields needed by the SARI prompt (not returned by get_sari_unscored_articles)
  let toScore: FullArticle[] = [];
  if (rpcRows.length > 0) {
    const ids = rpcRows.map((a) => a.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: condRows } = await (admin as any)
      .from("articles")
      .select("id, short_headline, short_resume, bottom_line")
      .in("id", ids);
    const condMap = Object.fromEntries(
      ((condRows ?? []) as { id: string; short_headline: string | null; short_resume: string | null; bottom_line: string | null }[])
        .map((r) => [r.id, r])
    );
    toScore = rpcRows.map((a) => ({
      ...a,
      short_headline: condMap[a.id]?.short_headline ?? null,
      short_resume:   condMap[a.id]?.short_resume   ?? null,
      bottom_line:    condMap[a.id]?.bottom_line     ?? null,
    }));
  }

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
                const sari = await scoreSari({
                  id: article.id,
                  title: article.title,
                  abstract: article.abstract,
                  short_headline: article.short_headline,
                  short_resume: article.short_resume,
                  bottom_line: article.bottom_line,
                }, activePrompt);
                // Approved-only principle: sari_condensed_at + sari_model_version are written
                // by condensation-sessions/route.ts when decision = approved, not here.
                const updatePayload = {
                  sari_subject:     sari.sari_subject,
                  sari_action:      sari.sari_action,
                  sari_result:      sari.sari_result,
                  sari_implication: sari.sari_implication,
                  sample_size:      sari.sample_size,
                };
                const { error } = await admin
                  .from("articles")
                  .update(updatePayload)
                  .eq("id", article.id);
                if (error) throw new Error(error.message);
                void admin.from("article_events").insert({
                  article_id: article.id,
                  event_type: "condensation_sari_scored",
                  payload: { version: sari.version },
                }).then(({ error }) => {
                  if (error) console.error(`[score-condensation-sari] article_events insert failed for ${article.id}:`, error.message);
                });
                scored++;
              } catch (e) {
                console.error(`[score-condensation-sari] failed article ${article.id}:`, e);
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
