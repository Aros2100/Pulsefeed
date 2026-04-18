import { createAdminClient } from "@/lib/supabase/admin";
import { logArticleEvent } from "@/lib/article-events";

export async function runAutoTagSpecialty(specialty: string): Promise<{ approved: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const startedAt = new Date().toISOString();

  // Insert start log
  const { data: logRow } = await admin
    .from("auto_tag_logs")
    .insert({ job: "specialty", status: "running", started_at: startedAt })
    .select("id")
    .single();
  const logId: string | null = logRow?.id ?? null;

  const errors: string[] = [];
  let approved = 0;

  try {
    const { data: articles, error } = await admin.rpc("get_single_ready_articles", {
      p_specialty: specialty,
    });

    if (error) throw new Error(error.message);

    if (articles?.length) {
      const articleIds = articles.map((a: { article_id: string }) => a.article_id);

      const { error: specErr } = await admin
        .from("article_specialties")
        .update({
          specialty_match: true,
          scored_by: "auto_tag",
          scored_at: new Date().toISOString(),
        })
        .in("article_id", articleIds)
        .eq("specialty", specialty);
      if (specErr) errors.push(specErr.message);

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

      approved = articleIds.length;
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  // Update log on completion
  if (logId) {
    await admin
      .from("auto_tag_logs")
      .update({
        status: errors.length > 0 ? "failed" : "completed",
        approved,
        completed_at: new Date().toISOString(),
        errors: errors.length > 0 ? errors : null,
      })
      .eq("id", logId);
  }

  console.log(`[auto-tag-specialty] approved=${approved} errors=${errors.length}`);
  return { approved };
}
