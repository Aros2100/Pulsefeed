import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export type ArticleEventType =
  | "imported"
  | "enriched"
  | "lab_decision"
  | "feedback"
  | "status_changed"
  | "verified"
  | "author_linked"
  | "quality_check"
  | "auto_tagged"
  | "geo_updated"
  | "authors_updated"
  | "specialty_scored"
  | "subspecialty_scored"
  | "article_type_scored"
  | "condensation_text_scored";

export async function logArticleEvent(
  articleId: string,
  eventType: ArticleEventType,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("article_events")
      .insert({
        article_id: articleId,
        event_type: eventType,
        payload: payload as Json,
      });

    if (error) {
      console.error(`[article-events] Failed to log ${eventType} for article ${articleId}:`, error.message);
    }
  } catch (err) {
    console.error(`[article-events] Unexpected error logging ${eventType} for article ${articleId}:`, err);
  }
}

// ── Geo update logging ────────────────────────────────────────────────────────

export type GeoUpdateSource = "parser" | "backfill" | "ror" | "parser_openalex" | "parser_pubmed" | "human" | "enrichment" | "manual";

export type GeoSnapshot = {
  geo_city?: string | null;
  geo_country?: string | null;
  geo_state?: string | null;
  geo_region?: string | null;
  geo_continent?: string | null;
  geo_institution?: string | null;
  geo_department?: string | null;
};

const GEO_KEYS: (keyof GeoSnapshot)[] = [
  "geo_city", "geo_country", "geo_state",
  "geo_region", "geo_continent", "geo_institution", "geo_department",
];

/**
 * Fire-and-forget: log a geo_updated event.
 * Only logs fields whose new value is non-null and differs from previous.
 * Skips entirely if nothing changed.
 */
export function logGeoUpdatedEvent(
  articleId: string,
  source: GeoUpdateSource,
  previous: GeoSnapshot | null,
  next: GeoSnapshot,
  parserConfidence?: "high" | "low" | null,
): void {
  const fieldsUpdated = GEO_KEYS.filter((k) => {
    const n = next[k] ?? null;
    const p = previous ? (previous[k] ?? null) : null;
    return n !== null && n !== p;
  });
  if (fieldsUpdated.length === 0) return;
  void logArticleEvent(articleId, "geo_updated", {
    source,
    parser_confidence: parserConfidence ?? null,
    fields_updated: fieldsUpdated,
    previous: previous ?? null,
    new: next,
  });
}
