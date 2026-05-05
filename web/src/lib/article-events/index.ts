import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

// ── Event type union ──────────────────────────────────────────────────────────

export type ArticleEventType =
  // Pipeline ingestion & sync
  | "imported"
  | "pubmed_synced"
  | "author_linked"
  | "authors_updated"
  | "geo_updated"
  | "citation_count_updated"
  | "impact_factor_updated"
  | "fwci_updated"
  // Tagging
  | "auto_tagged"
  // AI scoring (batch)
  | "specialty_scored"
  | "subspecialty_scored"
  | "article_type_scored"
  | "condensation_text_scored"
  | "condensation_sari_scored"
  | "geo_class_a_scored"
  | "geo_class_b_scored"
  // Human validation (lab)
  | "specialty_validated"
  | "subspecialty_validated"
  | "article_type_validated"
  | "condensation_text_validated"
  | "condensation_sari_validated"
  | "geo_class_a_validated"
  | "geo_class_b_validated"
  // Manual edits
  | "field_edited"
  // Newsletter lifecycle
  | "newsletter_selected"
  | "newsletter_sent"
  // Lifecycle
  | "retracted"
  // ── Deprecated — kept so historical events can still be parsed.
  //    New call-sites must NOT use these.
  /** @deprecated Use specialty_scored / subspecialty_scored etc. */
  | "enriched"
  /** @deprecated Use *_validated event types */
  | "lab_decision"
  /** @deprecated */
  | "feedback"
  /** @deprecated */
  | "status_changed"
  /** @deprecated */
  | "verified"
  /** @deprecated */
  | "quality_check"
  /** @deprecated Use condensation_sari_validated */
  | "condensation_validated";

// ── Actor / source types ──────────────────────────────────────────────────────

/** Format: "user:<uuid>" or "system:<service-name>" */
export type EventActor = `user:${string}` | `system:${string}`;

export type EventSource = "cron" | "manual" | "batch" | "import" | "sync";

// ── Scoring module names ──────────────────────────────────────────────────────

export type ScoringModule =
  | "specialty"
  | "subspecialty"
  | "article_type"
  | "condensation_text"
  | "condensation_sari"
  | "geo_class_a"
  | "geo_class_b";

// ── Payload building blocks ───────────────────────────────────────────────────

export type CorePayload = { actor: EventActor; source: EventSource };

// ── Core logger (unchanged) ───────────────────────────────────────────────────

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

// ── Geo update logging (unchanged) ───────────────────────────────────────────

export type GeoUpdateSource = "parser" | "backfill" | "ror_enriched" | "parser_openalex" | "parser_pubmed" | "human" | "enrichment" | "manual";

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

// ── Typed helpers ─────────────────────────────────────────────────────────────

/**
 * Log an AI scoring event for a given module.
 * Emits `${module}_scored` (e.g. "specialty_scored").
 */
export function logScoringEvent(
  articleId: string,
  module: ScoringModule,
  payload: CorePayload & { version: string; result?: unknown },
): void {
  const eventType = `${module}_scored` as ArticleEventType;
  void logArticleEvent(articleId, eventType, payload as Record<string, unknown>);
}

/**
 * Log a human validation decision for a given module.
 * Emits `${module}_validated` (e.g. "specialty_validated").
 */
export function logValidationEvent(
  articleId: string,
  module: ScoringModule,
  payload: CorePayload & { version: string; decision: "approved" | "rejected"; note?: string },
): void {
  const eventType = `${module}_validated` as ArticleEventType;
  void logArticleEvent(articleId, eventType, payload as Record<string, unknown>);
}

/**
 * Log a manual field edit.
 * Emits "field_edited".
 * Skips if `from` and `to` are deeply equal (no-op edit).
 */
export function logFieldEdit(
  articleId: string,
  field: string,
  from: unknown,
  to: unknown,
  actor: EventActor,
  source: EventSource,
): void {
  // Deep-equal check: JSON-serialize for objects/arrays, strict equality for primitives
  const fromStr = JSON.stringify(from ?? null);
  const toStr   = JSON.stringify(to ?? null);
  if (fromStr === toStr) return;

  void logArticleEvent(articleId, "field_edited", {
    actor,
    source,
    field,
    from: from ?? null,
    to:   to ?? null,
  });
}
