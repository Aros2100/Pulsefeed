import { createAdminClient } from "@/lib/supabase/admin";
import { logArticleEvent } from "@/lib/article-events";

export async function runAutoTagSpecialty(specialty: string): Promise<{ approved: number }> {
  const admin = createAdminClient();

  const { data: articles, error } = await admin.rpc("get_single_ready_articles", {
    p_specialty: specialty,
  });

  if (error || !articles?.length) return { approved: 0 };

  const articleIds = articles.map((a: { article_id: string }) => a.article_id);

  await admin
    .from("article_specialties")
    .update({
      specialty_match: true,
      scored_by: "auto_tag",
      scored_at: new Date().toISOString(),
    })
    .in("article_id", articleIds)
    .eq("specialty", specialty);

  await admin
    .from("articles")
    .update({ status: "approved", approval_method: "auto_tag" })
    .in("id", articleIds);

  await Promise.all(
    articleIds.map((id: string) =>
      logArticleEvent(id, "auto_tagged", {
        specialty,
        method: "single_term",
        matched_terms: articles.find((a: { article_id: string }) => a.article_id === id)?.matched_terms ?? [],
      })
    )
  );

  console.log(`[auto-tag-specialty] Approved ${articleIds.length} articles for ${specialty}`);
  return { approved: articleIds.length };
}
