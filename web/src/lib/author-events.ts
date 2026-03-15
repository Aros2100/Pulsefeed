import { createAdminClient } from "@/lib/supabase/admin";

export type AuthorEventType =
  | "created"
  | "openalex_enriched"
  | "geo_updated"
  | "merged";

export async function logAuthorEvent(
  authorId: string,
  eventType: AuthorEventType,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("author_events" as never)
      .insert({
        author_id: authorId,
        event_type: eventType,
        payload,
      } as never);

    if (error) {
      console.error(`[author-events] Failed to log ${eventType} for author ${authorId}:`, error.message);
    }
  } catch (err) {
    console.error(`[author-events] Unexpected error logging ${eventType} for author ${authorId}:`, err);
  }
}
