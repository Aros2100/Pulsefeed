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
  | "auto_tagged";

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
