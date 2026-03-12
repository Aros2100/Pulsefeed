import { createAdminClient } from "@/lib/supabase/admin";

interface PublicationTypeRule {
  id: string;
  pubmed_type: string;
  article_type: string | null;
  study_design: string | null;
}

export async function runPublicationTypeMapping(
  limit = 500
): Promise<{ mapped: number; skipped: number }> {
  const admin = createAdminClient();

  // 1. Hent aktive regler hvor mindst ét felt er sat
  const { data: rules, error: rulesErr } = await admin
    .from("publication_type_rules" as never)
    .select("id, pubmed_type, article_type, study_design" as never)
    .or("article_type.not.is.null,study_design.not.is.null" as never);

  if (rulesErr) throw new Error(`Rules fetch failed: ${rulesErr.message}`);

  const typedRules = (rules ?? []) as PublicationTypeRule[];
  if (typedRules.length === 0) return { mapped: 0, skipped: 0 };

  // Byg lookup: pubmed_type (lowercase) → regel
  const ruleMap = new Map<string, PublicationTypeRule>();
  for (const r of typedRules) {
    ruleMap.set(r.pubmed_type.toLowerCase(), r);
  }

  // 2. Hent artikler der mangler mapping og har publication_types
  const { data: articles, error: artErr } = await admin
    .from("articles" as never)
    .select("id, publication_types" as never)
    .is("article_type_ai" as never, null as never)
    .is("study_design_ai" as never, null as never)
    .not("publication_types" as never, "is" as never, null as never)
    .limit(limit as never);

  if (artErr) throw new Error(`Articles fetch failed: ${artErr.message}`);

  type ArticleRow = { id: string; publication_types: string[] };
  const typedArticles = (articles ?? []) as ArticleRow[];
  if (typedArticles.length === 0) return { mapped: 0, skipped: 0 };

  let mapped = 0;
  let skipped = 0;

  // 3. For hver artikel: match publication_types mod regler
  for (const article of typedArticles) {
    const articleTypes = new Set<string>();
    const studyDesigns = new Set<string>();

    for (const pt of article.publication_types) {
      const rule = ruleMap.get(pt.toLowerCase());
      if (rule) {
        if (rule.article_type) articleTypes.add(rule.article_type);
        if (rule.study_design) studyDesigns.add(rule.study_design);
      }
    }

    if (articleTypes.size === 0 && studyDesigns.size === 0) {
      skipped++;
      continue;
    }

    const update: Record<string, string[]> = {};
    if (articleTypes.size > 0) update.article_type_ai = [...articleTypes];
    if (studyDesigns.size > 0) update.study_design_ai = [...studyDesigns];

    const { error: updErr } = await admin
      .from("articles" as never)
      .update(update as never)
      .eq("id" as never, article.id as never);

    if (updErr) {
      console.error(`[pubtype-map] update failed for ${article.id}:`, updErr.message);
      skipped++;
    } else {
      mapped++;
    }
  }

  return { mapped, skipped };
}
