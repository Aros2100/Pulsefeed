// Condensation-text-specific batch orchestration.
// No HTTP, no API routes — pure functions called from route handlers.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getActivePrompt,
  buildCondensationTextRequest,
  parseCondensationTextResponse,
  type ActivePrompt,
} from "@/lib/lab/scorer";
import { logScoringEvent, type EventActor, type EventSource } from "@/lib/article-events";
import { recordBatchUsage } from "@/lib/ai/tracked-client";
import { getBatchResults, type BatchRequest } from "./client";

type Article = { id: string; title: string; abstract: string | null };

export async function prepareCondensationTextBatch(
  specialty: string,
  options: { limit?: number; edat_from?: string; edat_to?: string }
): Promise<{
  activePrompt: ActivePrompt;
  articles: Article[];
  requests: BatchRequest[];
  customIdMap: Record<string, string>;
}> {
  const activePrompt = await getActivePrompt(specialty, "condensation_text");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin.rpc("get_text_unscored_articles", {
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
    const custom_id = `cond_${article.id}`; // "cond_" + uuid = 41 chars, within 64-char limit
    customIdMap[custom_id] = article.id;
    requests.push({
      custom_id,
      params: buildCondensationTextRequest(article, specialty, activePrompt),
    });
  }

  return { activePrompt, articles, requests, customIdMap };
}

export async function ingestCondensationTextBatchResults(
  anthropicBatchId: string,
  customIdMap: Record<string, string>,
  specialty: string,
  promptVersion: string
): Promise<{
  scored: number;
  failed: number;
  failedIds: string[];
}> {
  const admin = createAdminClient();

  let scored = 0;
  const failedIds: string[] = [];

  for await (const line of getBatchResults(anthropicBatchId)) {
    const article_id = customIdMap[line.custom_id];
    if (!article_id) {
      console.warn(`[ingestCondensationTextBatchResults] unknown custom_id: ${line.custom_id}`);
      continue;
    }

    if (line.result.type === "succeeded") {
      const rawText = (line.result.message!.content[0] as { type: string; text: string }).text.trim();
      const cls = parseCondensationTextResponse(rawText, promptVersion);

      const { error } = await admin
        .from("articles")
        .update({
          short_headline:   cls.short_headline,
          short_resume:     cls.short_resume,
          bottom_line:      cls.bottom_line,
          text_model_version: cls.version,
          text_condensed_at:  new Date().toISOString(),
        })
        .eq("id", article_id);

      if (error) {
        console.error(`[ingestCondensationTextBatchResults] DB update failed for ${article_id}: ${error.message}`);
        failedIds.push(article_id);
        continue;
      }

      void logScoringEvent(article_id, "condensation_text", {
        actor:   "system:batch-condensation-text" as EventActor,
        source:  "batch" as EventSource,
        version: cls.version,
      });

      recordBatchUsage({
        modelKey:         `condensation_${promptVersion}`,
        model:            line.result.message!.model,
        promptTokens:     line.result.message!.usage.input_tokens,
        completionTokens: line.result.message!.usage.output_tokens,
        articleId:        article_id,
        task:             "condensation_text",
      });

      scored++;
    } else {
      console.warn(`[ingestCondensationTextBatchResults] non-succeeded result for ${article_id}: ${line.result.type}`);
      failedIds.push(article_id);
    }
  }

  return { scored, failed: failedIds.length, failedIds };
}
