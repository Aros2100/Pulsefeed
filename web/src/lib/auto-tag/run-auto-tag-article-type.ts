import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { logArticleEvent, type EventActor, type EventSource } from "@/lib/article-events";

function normalize(s: string): string {
  return s.toLowerCase().replace(/,/g, "").trim();
}

export async function runAutoTagArticleType(): Promise<{ scored: number; skipped: number; approved: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const startedAt = new Date().toISOString();

  // Insert start log
  const { data: logRow } = await admin
    .from("auto_tag_logs")
    .insert({ job: "article_type", status: "running", started_at: startedAt })
    .select("id")
    .single();
  const logId: string | null = logRow?.id ?? null;

  const errors: string[] = [];
  let scored = 0;
  let skipped = 0;
  let approved = 0;

  try {
    // Fetch active rules
    const { data: rulesData, error: rulesError } = await admin
      .from("article_type_rules")
      .select("publication_type, article_type, priority")
      .eq("is_active", true);

    if (rulesError) throw new Error(rulesError.message);

    const rules = (rulesData ?? []) as { publication_type: string; article_type: string; priority: number }[];
    const priorityMap = new Map<string, { article_type: string; priority: number }>();
    for (const rule of rules) {
      priorityMap.set(normalize(rule.publication_type), { article_type: rule.article_type, priority: rule.priority });
    }

    if (priorityMap.size > 0) {
      // Fetch candidates
      const allArticles: { id: string; publication_types: string[] | null }[] = [];
      const PAGE = 1000;
      for (let offset = 0; ; offset += PAGE) {
        const { data } = await admin.rpc("get_article_type_candidates", {
          p_specialty: ACTIVE_SPECIALTY,
          p_offset: offset,
          p_limit: PAGE,
        });
        if (!data || data.length === 0) break;
        allArticles.push(...data);
        if (data.length < PAGE) break;
      }

      // Score
      for (const article of allArticles) {
        const pubTypes = article.publication_types ?? [];
        let matched: string | null = null;
        let matchedRaw: string | null = null;
        let matchedPriority = Infinity;

        for (const pt of pubTypes) {
          const rule = priorityMap.get(normalize(pt));
          if (rule && rule.priority < matchedPriority) {
            matched = rule.article_type;
            matchedRaw = pt;
            matchedPriority = rule.priority;
          }
        }

        if (!matched || !matchedRaw) {
          skipped++;
        } else {
          const { error: updateErr } = await admin.from("articles").update({
            article_type:               matched,
            article_type_ai:            matched,
            article_type_confidence:    95,
            article_type_rationale:     `Classified by publication type: ${matchedRaw}`,
            article_type_method:        "deterministic",
            article_type_validated:     false,
            article_type_scored_at:     new Date().toISOString(),
            article_type_model_version: "deterministic-v2",
          }).eq("id", article.id);
          if (updateErr) errors.push(updateErr.message);
          else scored++;
        }
      }

      // Godkend alle deterministisk scorede
      const { data: toApprove } = await admin
        .from("articles")
        .select("id, article_type_ai")
        .eq("article_type_method", "deterministic")
        .eq("article_type_validated", false);

      const approveIds = (toApprove ?? []).map((a: { id: string }) => a.id);

      if (approveIds.length > 0) {
        await admin.from("articles").update({ article_type_validated: true }).in("id", approveIds);
        await Promise.all(
          (toApprove ?? []).map((a: { id: string; article_type_ai: string | null }) =>
            logArticleEvent(a.id, "auto_tagged", {
              actor:  "system:cron-auto-tag-article-type" as EventActor,
              source: "cron" as EventSource,
              module: "article_type",
              method: "deterministic",
              result: a.article_type_ai,
            })
          )
        );
        approved = approveIds.length;
      }
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

  console.log(`[auto-tag-article-type] scored=${scored} skipped=${skipped} approved=${approved} errors=${errors.length}`);
  return { scored, skipped, approved };
}
