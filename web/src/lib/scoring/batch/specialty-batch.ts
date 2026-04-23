// Specialty-specific batch orchestration.
// No HTTP, no API routes — pure functions called from route handlers.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getActivePrompt,
  buildSpecialtyRequest,
  parseSpecialtyResponse,
  type ActivePrompt,
} from "@/lib/lab/scorer";
import { logArticleEvent } from "@/lib/article-events";
import { submitBatch, getBatchResults, type BatchRequest } from "./client";

type Article = { id: string; title: string; abstract: string | null };

export async function prepareSpecialtyBatch(
  specialty: string,
  options: { limit?: number; edat_from?: string; edat_to?: string }
): Promise<{
  activePrompt: ActivePrompt;
  articles: Article[];
  requests: BatchRequest[];
  customIdMap: Record<string, string>;
}> {
  const activePrompt = await getActivePrompt(specialty, "specialty");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin.rpc("get_specialty_unscored_articles", {
    p_specialty: specialty,
    p_limit:     options.limit ?? 10000,
    p_edat_from: options.edat_from ?? null,
    p_edat_to:   options.edat_to   ?? null,
  });

  if (error) throw new Error(`Failed to fetch unscored articles: ${error.message}`);

  const articles = (data ?? []) as Article[];

  const requests: BatchRequest[] = [];
  const customIdMap: Record<string, string> = {};

  for (const article of articles) {
    const custom_id = `spec_${article.id}`; // uuid → well within 64-char limit
    customIdMap[custom_id] = article.id;
    requests.push({
      custom_id,
      params: buildSpecialtyRequest(article, specialty, activePrompt),
    });
  }

  return { activePrompt, articles, requests, customIdMap };
}

export async function ingestSpecialtyBatchResults(
  anthropicBatchId: string,
  customIdMap: Record<string, string>,
  specialty: string,
  promptVersion: string
): Promise<{
  scored: number;
  approved: number;
  rejected: number;
  failed: number;
  failedIds: string[];
}> {
  const admin = createAdminClient();

  let scored = 0;
  let approved = 0;
  let rejected = 0;
  const failedIds: string[] = [];

  for await (const line of getBatchResults(anthropicBatchId)) {
    const article_id = customIdMap[line.custom_id];
    if (!article_id) {
      console.warn(`[ingestSpecialtyBatchResults] unknown custom_id: ${line.custom_id}`);
      continue;
    }

    if (line.result.type === "succeeded") {
      const rawText = (line.result.message!.content[0] as { type: string; text: string }).text.trim();
      const score = parseSpecialtyResponse(rawText, promptVersion);

      const { error } = await admin
        .from("article_specialties")
        .update({
          specialty_match: score.ai_decision === "approved",
          source:          "ai_score",
          scored_by:       score.version,
          scored_at:       new Date().toISOString(),
        })
        .eq("article_id", article_id)
        .eq("specialty", specialty);

      if (error) {
        console.error(`[ingestSpecialtyBatchResults] DB update failed for ${article_id}: ${error.message}`);
        failedIds.push(article_id);
        continue;
      }

      void logArticleEvent(article_id, "enriched", {
        specialty,
        module:   "specialty",
        decision: score.ai_decision,
        version:  score.version,
      });

      scored++;
      if (score.ai_decision === "approved") approved++; else rejected++;
    } else {
      console.warn(`[ingestSpecialtyBatchResults] non-succeeded result for ${article_id}: ${line.result.type}`);
      failedIds.push(article_id);
    }
  }

  return { scored, approved, rejected, failed: failedIds.length, failedIds };
}

export { submitBatch };
