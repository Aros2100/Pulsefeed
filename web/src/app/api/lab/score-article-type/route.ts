import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import pLimit from "p-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getActivePrompt, scoreArticleType, type ActivePrompt } from "@/lib/lab/scorer";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

const CONCURRENCY  = 1;
const DELAY_MS     = 1300;
const BATCH_LIMIT  = 25;
const FIXED_SPECIALTY = ACTIVE_SPECIALTY;

const schema = z.object({
  scoreAll: z.boolean().optional().default(false),
});

type Article = {
  id: string;
  title: string;
  abstract: string | null;
  journal_abbr: string | null;
  journal_title: string | null;
  mesh_terms: unknown;
  publication_types: unknown;
};

async function classifyWithDelay(
  article: Article,
  activePrompt: ActivePrompt
) {
  await new Promise((r) => setTimeout(r, DELAY_MS));
  return classifyWithRetry(article, activePrompt);
}

async function classifyWithRetry(
  article: Article,
  activePrompt: ActivePrompt,
  retries = 3
) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await scoreArticleType(article, activePrompt);
    } catch (err: unknown) {
      console.error(`[score-article-type] scoreArticleType error for ${article.id}:`, err);
      const status = (err as { status?: number })?.status;
      if (status === 429 && attempt < retries - 1) {
        const waitMs = (attempt + 1) * 60_000;
        console.warn(`[score-article-type] rate limited — waiting ${waitMs / 1000}s before retry ${attempt + 1}/${retries - 1}`);
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

  const { scoreAll } = result.data;
  const admin = createAdminClient();

  let activePrompt;
  try {
    activePrompt = await getActivePrompt(FIXED_SPECIALTY, "article_type");
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 422 });
  }

  let articles: Article[] | null;
  let fetchError: { message: string } | null;

  if (scoreAll) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rescoreIds } = await (admin as any).rpc("get_article_type_rescore_candidates", {
      p_specialty: FIXED_SPECIALTY,
      p_version: activePrompt.version,
      p_limit: 500,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidateIds: string[] = ((rescoreIds ?? []) as any[]).map((r) => r.id ?? r);

    const res = await admin
      .from("articles")
      .select("id, title, abstract, journal_abbr, journal_title, mesh_terms, publication_types")
      .in("id", candidateIds.length > 0 ? candidateIds : ["00000000-0000-0000-0000-000000000000"])
      .limit(500);
    articles = res.data as Article[] | null;
    fetchError = res.error;
  } else {
    // Normal Lab-scoring: fill up to BATCH_LIMIT
    // Count only AI-scored but not yet validated (avoids counting deterministic + validated rows)
    const { count: existingCount } = await admin
      .from("articles")
      .select("*", { count: "exact", head: true })
      .not("article_type_scored_at", "is", null)
      .is("article_type_method", null)
      .eq("article_type_validated", false);
    const existing = existingCount ?? 0;
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

    // Fetch only articles with specialty_match = true (via article_specialties join)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: specialtyIds, error: candidateError } = await (admin as any).rpc("get_article_type_candidates", {
      p_specialty: FIXED_SPECIALTY,
      p_offset: 0,
      p_limit: remaining * 5, // over-fetch so we can filter to unscored
    });

    if (candidateError) {
      console.error("[score-article-type] candidates error:", candidateError);
      return NextResponse.json({ ok: false, error: candidateError.message }, { status: 500 });
    }

    console.log("[score-article-type] raw candidates sample:", JSON.stringify((specialtyIds as unknown[])?.slice(0, 2)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidateIds: string[] = ((specialtyIds ?? []) as any[]).map((r) => r.id ?? r);
    console.log(`[score-article-type] candidates: ${candidateIds.length}, remaining: ${remaining}`);
    console.log("[score-article-type] candidateIds sample:", candidateIds.slice(0, 2));

    const res = await admin
      .from("articles")
      .select("id, title, abstract, journal_abbr, journal_title, mesh_terms, publication_types")
      .in("id", candidateIds.length > 0 ? candidateIds : ["00000000-0000-0000-0000-000000000000"])
      .is("article_type_scored_at", null)
      .order("circle", { ascending: false, nullsFirst: false })
      .limit(remaining);
    articles = res.data as Article[] | null;
    fetchError = res.error;
  }

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  const toScore = (articles ?? []) as Article[];
  console.log(`[score-article-type] toScore.length: ${toScore.length}`);

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
                const cls = await classifyWithDelay(article, activePrompt!);
                console.log(`[score-article-type] scored ${article.id}: ${cls.article_type}`);
                const VALID_ARTICLE_TYPES = [
                  "Meta-analysis", "Review", "Intervention study", "Non-interventional study",
                  "Basic study", "Case", "Guideline", "Surgical Technique", "Tech",
                  "Administration", "Letters & Notices", "Unclassified",
                ];
                if (!VALID_ARTICLE_TYPES.includes(cls.article_type)) {
                  console.warn(`[score-article-type] invalid article_type "${cls.article_type}" for ${article.id} — falling back to Unclassified`);
                  cls.article_type = "Unclassified";
                }
                const { error } = await admin
                  .from("articles")
                  .update({
                    article_type_ai:            cls.article_type,
                    article_type_rationale:     cls.rationale,
                    article_type_model_version: cls.version,
                    article_type_scored_at:     new Date().toISOString(),
                    article_type_confidence:    cls.confidence,
                  })
                  .eq("id", article.id);
                if (error) throw new Error(error.message);
                scored++;
              } catch (e) {
                const status = (e as { status?: number })?.status;
                const msg = (e as Error)?.message ?? String(e);
                console.error(`[score-article-type] failed article ${article.id} (status=${status}): ${msg}`);
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
