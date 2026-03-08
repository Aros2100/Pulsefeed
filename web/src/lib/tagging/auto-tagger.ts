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

export interface ScoredArticle {
  id: string;
  title: string;
  journal_abbr: string | null;
  published_date: string | null;
  mesh_score: number;
  matched_terms: string[];
}

/** Score all pending articles for a specialty against active tagging rules. */
export async function scorePendingArticles(
  specialty: string
): Promise<{
  ready: ScoredArticle[];
  borderline: ScoredArticle[];
  noMatch: number;
  totalPending: number;
}> {
  const admin = createAdminClient();

  const { data: rules } = await admin
    .from("tagging_rules" as never)
    .select("id, term, approve_rate, total_decisions" as never)
    .eq("specialty" as never, specialty as never)
    .eq("status" as never, "active" as never);

  const ruleMap = new Map<string, TaggingRule>();
  for (const r of (rules ?? []) as TaggingRule[]) {
    ruleMap.set(r.term, r);
  }

  const ready: ScoredArticle[] = [];
  const borderline: ScoredArticle[] = [];
  let noMatch = 0;
  let totalPending = 0;
  const PAGE_SIZE = 1000;

  for (let from = 0; ; ) {
    const { data: articles } = await admin
      .from("articles")
      .select("id, title, journal_abbr, published_date, mesh_terms")
      .eq("status", "pending")
      .contains("specialty_tags", [specialty])
      .is("auto_tagged_at" as never, null as never)
      .range(from, from + PAGE_SIZE - 1);

    if (!articles || articles.length === 0) break;
    totalPending += articles.length;

    for (const article of articles as unknown as (Article & { title: string; journal_abbr: string | null; published_date: string | null })[]) {
      const result = computeMeshScore(article.mesh_terms, ruleMap);
      if (!result) {
        noMatch++;
        continue;
      }

      const scored: ScoredArticle = {
        id: article.id,
        title: article.title,
        journal_abbr: article.journal_abbr,
        published_date: article.published_date,
        mesh_score: result.score,
        matched_terms: result.matchedTerms,
      };

      if (result.score >= 95) {
        ready.push(scored);
      } else if (result.score >= 70) {
        borderline.push(scored);
      } else {
        noMatch++;
      }
    }

    if (articles.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  ready.sort((a, b) => b.mesh_score - a.mesh_score);
  borderline.sort((a, b) => b.mesh_score - a.mesh_score);

  return { ready, borderline, noMatch, totalPending };
}

export async function runAutoTag(
  specialty: string
): Promise<{ tagged: number; skipped: number }> {
  const admin = createAdminClient();

  const { data: rules, error: rulesErr } = await admin
    .from("tagging_rules" as never)
    .select("id, term, approve_rate, total_decisions" as never)
    .eq("specialty" as never, specialty as never)
    .eq("status" as never, "active" as never);

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
    const { data: articles } = await admin
      .from("articles")
      .select("id, mesh_terms")
      .eq("status", "pending")
      .contains("specialty_tags", [specialty])
      .is("auto_tagged_at" as never, null as never)
      .range(from, from + PAGE_SIZE - 1);

    if (!articles || articles.length === 0) break;

    for (const article of articles as unknown as Article[]) {
      const result = computeMeshScore(article.mesh_terms, ruleMap);

      if (!result) {
        skipped++;
        continue;
      }

      if (result.score >= 95) {
        const { error: updateErr } = await admin
          .from("articles")
          .update({
            status: "approved",
            auto_tagged_at: new Date().toISOString(),
          } as never)
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
