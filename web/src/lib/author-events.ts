import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export type AuthorEventType =
  | "created"
  | "openalex_enriched"
  | "geo_updated"
  | "merged"
  | "article_linked"
  | "openalex_fetched"
  | "geo_parsed";

export async function logAuthorEvent(
  authorId: string,
  eventType: AuthorEventType,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("author_events")
      .insert({
        author_id: authorId,
        event_type: eventType,
        payload: payload as Json,
      });

    if (error) {
      console.error(`[author-events] Failed to log ${eventType} for author ${authorId}:`, error.message);
    }
  } catch (err) {
    console.error(`[author-events] Unexpected error logging ${eventType} for author ${authorId}:`, err);
  }
}
