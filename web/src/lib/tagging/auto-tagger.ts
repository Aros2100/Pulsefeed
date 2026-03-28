import { createAdminClient } from "@/lib/supabase/admin";
import { logArticleEvent } from "@/lib/article-events";

interface TaggingRule {
  id: string;
  term: string;
  approve_rate: number;
  total_decisions: number;
}

interface MeshTerm {
  descriptor: string;
  major: boolean;
  qualifiers: string[];
}

interface Article {
  id: string;
  mesh_terms: MeshTerm[];
}

/** Weighted mesh score: SUM(approve_rate × total_decisions) / SUM(total_decisions) */
export function computeMeshScore(
  meshTerms: MeshTerm[],
  activeRules: Map<string, TaggingRule>
): { score: number; matchedTerms: string[] } | null {
  const majorTerms = (meshTerms ?? []).filter((m) => m.major);
  if (majorTerms.length === 0) return null;

  let weightedSum = 0;
  let totalWeight = 0;
  const matchedTerms: string[] = [];

  for (const mt of majorTerms) {
    const rule = activeRules.get(mt.descriptor);
    if (rule) {
      weightedSum += rule.approve_rate * rule.total_decisions;
      totalWeight += rule.total_decisions;
      matchedTerms.push(mt.descriptor);
    }
  }

  if (matchedTerms.length === 0) return null;

  return {
    score: Math.round((weightedSum / totalWeight) * 100) / 100,
    matchedTerms,
  };
}

export async function runAutoTag(
  specialty: string
): Promise<{ tagged: number; skipped: number }> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  const { data: rules, error: rulesErr } = await admin
    .from("tagging_rules")
    .select("id, term, approve_rate, total_decisions")
    .eq("specialty", specialty)
    .eq("status", "active");

  if (rulesErr || !rules || (rules as TaggingRule[]).length === 0) {
    return { tagged: 0, skipped: 0 };
  }

  const ruleMap = new Map<string, TaggingRule>();
  for (const r of rules as TaggingRule[]) {
    ruleMap.set(r.term, r);
  }

  let tagged = 0;
  let skipped = 0;
  const PAGE_SIZE = 500;

  for (let from = 0; ; ) {
    // Get pending article IDs from article_specialties (specialty_match IS NULL = not yet scored)
    const { data: pendingIdRows } = await db
      .from("article_specialties")
      .select("article_id")
      .eq("specialty", specialty)
      .is("specialty_match", null)
      .range(from, from + PAGE_SIZE - 1);
    const pendingIds = (pendingIdRows ?? []).map((r: { article_id: string }) => r.article_id);

    const { data: articles } = pendingIds.length > 0
      ? await admin
          .from("articles")
          .select("id, mesh_terms")
          .in("id", pendingIds)
          .is("auto_tagged_at", null)
      : { data: [] };

    if (!articles || articles.length === 0) break;

    for (const article of articles as unknown as Article[]) {
      const result = computeMeshScore(article.mesh_terms, ruleMap);

      if (!result) {
        skipped++;
        continue;
      }

      if (result.score >= 95) {
        const now = new Date().toISOString();
        const { error: asErr } = await db
          .from("article_specialties")
          .update({ specialty_match: true, scored_by: "auto_tagger", scored_at: now })
          .eq("article_id", article.id)
          .eq("specialty", specialty);
        const { error: updateErr } = asErr ? { error: asErr } : await admin
          .from("articles")
          .update({ auto_tagged_at: now })
          .eq("id", article.id);

        if (!updateErr) {
          await logArticleEvent(article.id, "auto_tagged", {
            specialty,
            mesh_score: result.score,
            matched_terms: result.matchedTerms.length,
            total_major_terms: (article.mesh_terms ?? []).filter((m) => m.major).length,
          });
          tagged++;
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    }

    if (articles.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { tagged, skipped };
}
