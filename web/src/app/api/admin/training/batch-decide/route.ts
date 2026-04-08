import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { logArticleEvent } from "@/lib/article-events";

const schema = z.object({
  specialty: z.string().refine(
    (v) => v === ACTIVE_SPECIALTY,
    { message: "Invalid specialty" }
  ),
  verdicts: z.array(z.object({
    article_id: z.string().uuid(),
    verdict: z.enum(["relevant", "not_relevant"]),
    ai_confidence: z.number().int().min(0).max(100).nullable().optional(),
  })).min(1),
});

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

  const { specialty, verdicts } = result.data;
  const admin = createAdminClient();

  const relevantIds = verdicts.filter((v) => v.verdict === "relevant").map((v) => v.article_id);
  const rejectedIds = verdicts.filter((v) => v.verdict === "not_relevant").map((v) => v.article_id);

  // Fetch old status before updating so we can record the transition
  const allChangedIds = [...relevantIds, ...rejectedIds];
  const { data: oldArticles } = allChangedIds.length > 0
    ? await admin.from("articles").select("id, status").in("id", allChangedIds)
    : { data: [] };
  const oldMap = new Map((oldArticles ?? []).map((a) => [a.id as string, a as { id: string; status: string | null }]));

  const [relevantResult, rejectedResult] = await Promise.all([
    relevantIds.length > 0
      ? admin.from("articles")
          .update({ approval_method: "human", status: "approved", specialty_tags: [specialty] })
          .in("id", relevantIds)
      : Promise.resolve({ error: null }),
    rejectedIds.length > 0
      ? admin.from("articles")
          .update({ status: "rejected" })
          .in("id", rejectedIds)
      : Promise.resolve({ error: null }),
  ]);

  if (relevantResult.error) {
    return NextResponse.json({ ok: false, error: relevantResult.error.message }, { status: 500 });
  }
  if (rejectedResult.error) {
    return NextResponse.json({ ok: false, error: rejectedResult.error.message }, { status: 500 });
  }

  void Promise.all([
    ...relevantIds.map((id) => {
      const old = oldMap.get(id);
      return logArticleEvent(id, "status_changed", { from: old?.status ?? null, to: "approved", changed_by: auth.userId });
    }),
    ...rejectedIds.map((id) => {
      const old = oldMap.get(id);
      return logArticleEvent(id, "status_changed", { from: old?.status ?? null, to: "rejected", changed_by: auth.userId });
    }),
  ]);

  return NextResponse.json({
    ok: true,
    verified: relevantIds.length,
    rejected: rejectedIds.length,
  });
}
