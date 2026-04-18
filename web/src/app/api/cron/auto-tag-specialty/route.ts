import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { logArticleEvent } from "@/lib/article-events";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const specialty = ACTIVE_SPECIALTY;

  // Find alle pending artikler der matcher aktive single terms
  const { data: articles, error } = await admin.rpc("get_single_ready_articles", {
    p_specialty: specialty,
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!articles?.length) return NextResponse.json({ ok: true, approved: 0 });

  const articleIds = articles.map((a: { article_id: string }) => a.article_id);

  // Sæt specialty_match = true
  const { error: updateErr } = await admin
    .from("article_specialties")
    .update({
      specialty_match: true,
      scored_by: "auto_tag",
      scored_at: new Date().toISOString(),
    })
    .in("article_id", articleIds)
    .eq("specialty", specialty);

  if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });

  // Opdater articles.status = approved
  await admin
    .from("articles")
    .update({ status: "approved", approval_method: "auto_tag" })
    .in("id", articleIds);

  // Log events
  await Promise.all(
    articleIds.map((id: string) =>
      logArticleEvent(id, "auto_tagged", {
        specialty,
        method: "single_term",
        matched_terms: articles.find((a: { article_id: string }) => a.article_id === id)?.matched_terms ?? [],
      })
    )
  );

  return NextResponse.json({ ok: true, approved: articleIds.length });
}
