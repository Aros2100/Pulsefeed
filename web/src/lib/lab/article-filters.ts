// IMPORTANT: These filters must match the corresponding RPC functions in Supabase.
// If you change filters here, also update:
//   - get_scored_not_validated_articles (specialty_tag)
//   - get_subspecialty_not_validated_articles (subspecialty)
//   - get_condensation_not_validated_articles (condensation)
//   - get_article_type_not_validated_articles (article_type)
//   - count_scored_not_validated, count_subspecialty_not_validated, count_condensation_not_validated
//   - count_article_type_not_validated

/**
 * Central filter definitions per Lab module.
 * Used by BOTH scoring routes and referenced by RPC functions.
 * If you change filters here, update the corresponding RPC in Supabase.
 */
export const MODULE_FILTERS = {
  specialty_tag: {
    description: "Pending articles for specialty validation",
    filters: { status: "pending", circle: null },
    requireAbstract: false,
    nullCheck: "specialty_confidence",
  },
  subspecialty: {
    description: "Approved C3 articles for subspecialty classification",
    filters: { status: "approved", circle: null },
    requireAbstract: true,
    nullCheck: "subspecialty_scored_at",
  },
  condensation: {
    description: "Approved C3 articles for condensation",
    filters: { status: "approved", circle: 3 },
    requireAbstract: true,
    nullCheck: "condensed_at",
  },
  article_type: {
    description: "Approved articles for article type classification",
    filters: { status: "approved", circle: null },
    requireAbstract: true,
    nullCheck: "article_type_scored_at",
  },
} as const;

export type ModuleKey = keyof typeof MODULE_FILTERS;

/**
 * Apply standard filters to an articles query for a given module.
 * Returns a query for articles ELIGIBLE for scoring (not yet scored),
 * or null if there are no eligible articles (early-exit signal).
 *
 * For modules that require approved articles, uses article_specialties as
 * source of truth (specialty_match = true) instead of articles.status.
 */
export async function applyUnscoredFilters(
  query: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  module: ModuleKey,
  specialty: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
): Promise<any | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const config = MODULE_FILTERS[module];

  let q = query;

  if (config.filters.status === "approved") {
    // Use article_specialties as source of truth for approved articles
    const { data: approvedIds } = await admin
      .from("article_specialties")
      .select("article_id")
      .eq("specialty", specialty)
      .eq("specialty_match", true);
    const ids = (approvedIds ?? []).map((r: { article_id: string }) => r.article_id);
    if (ids.length === 0) return null;
    q = q.in("id", ids);
  } else {
    q = q.eq("status", config.filters.status);
  }

  if (config.filters.circle !== null) {
    q = q.eq("circle", config.filters.circle);
  }

  if (config.requireAbstract) {
    q = q.not("abstract", "is", null);
  }

  q = q.is(config.nullCheck, null);

  return q;
}
