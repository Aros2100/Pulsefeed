import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logArticleEvent } from "@/lib/article-events";
import { z } from "zod";

const matchedTermSchema = z.object({
  term: z.string(),
  approve_rate: z.number(),
  total_decisions: z.number(),
});

const articleScoreSchema = z.object({
  mesh_score: z.number(),
  matched_terms: z.array(matchedTermSchema),
});

const schema = z.object({
  articleIds: z.array(z.string().uuid()).min(1).max(5000),
  specialty: z.string(),
  articleScores: z.record(z.string().uuid(), articleScoreSchema).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid input" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const now = new Date().toISOString();
  let approved = 0;

  // Batch update in chunks of 50
  const { articleIds, specialty, articleScores } = parsed.data;
  for (let i = 0; i < articleIds.length; i += 50) {
    const chunk = articleIds.slice(i, i + 50);
    const { error } = await db
      .from("article_specialties")
      .update({
        specialty_match: true,
        scored_by: "human",
        scored_at: now,
      })
      .in("article_id", chunk)
      .eq("specialty", specialty);

    if (!error) {
      await admin
        .from("articles")
        .update({ approval_method: "mesh_auto_tag", auto_tagged_at: now })
        .in("id", chunk);

      for (const id of chunk) {
        const score = articleScores?.[id];
        await logArticleEvent(id, "auto_tagged", {
          source: "mesh_auto_tagging",
          specialty,
          threshold: 95,
          approved_by: auth.userId,
          mesh_score: score?.mesh_score ?? null,
          matched_terms: score?.matched_terms ?? [],
        });
      }
      approved += chunk.length;
    }
  }

  return NextResponse.json({ ok: true, approved });
}
