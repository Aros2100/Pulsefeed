// Subspecialty-specific batch orchestration.
// No HTTP, no API routes — pure functions called from route handlers.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getActivePrompt,
  buildSubspecialtyRequest,
  parseSubspecialtyResponse,
  type ActivePrompt,
} from "@/lib/lab/scorer";
import { logScoringEvent, type EventActor, type EventSource } from "@/lib/article-events";
import { recordBatchUsage } from "@/lib/ai/tracked-client";
import { getBatchResults, type BatchRequest } from "./client";

type Article = { id: string; title: string; abstract: string | null };

async function fetchCodeMap(specialty: string): Promise<Map<number, string>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("subspecialties")
    .select("code, name")
    .eq("specialty", specialty)
    .eq("active", true)
    .not("code", "is", null);
  return new Map<number, string>(
    ((data ?? []) as { code: number; name: string }[]).map((r) => [r.code, r.name])
  );
}

export async function prepareSubspecialtyBatch(
  specialty: string,
  options: { limit?: number; edat_from?: string; edat_to?: string; mode?: "new" | "rescore"; since?: string }
): Promise<{
  activePrompt: ActivePrompt;
  articles: Article[];
  requests: BatchRequest[];
  customIdMap: Record<string, string>;
}> {
  const activePrompt = await getActivePrompt(specialty, "subspecialty");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin.rpc("get_subspecialty_unscored_articles", {
    p_specialty: specialty,
    p_limit:     options.limit ?? (options.mode ? 500 : 50),
    p_edat_from: options.edat_from ?? null,
    p_edat_to:   options.edat_to   ?? null,
    p_mode:      options.mode  ?? null,
    p_since:     options.since ?? null,
  });

  if (error) throw new Error(`Failed to fetch unscored articles: ${error.message}`);

  const articles = (data ?? []) as Article[];

  const requests: BatchRequest[] = [];
  const customIdMap: Record<string, string> = {};

  for (const article of articles) {
    const custom_id = `subsp_${article.id}`; // "subsp_" + uuid = 42 chars, within 64-char limit
    customIdMap[custom_id] = article.id;
    requests.push({
      custom_id,
      params: buildSubspecialtyRequest(article, specialty, activePrompt),
    });
  }

  return { activePrompt, articles, requests, customIdMap };
}

export async function ingestSubspecialtyBatchResults(
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
  const codeMap = await fetchCodeMap(specialty);

  let scored = 0;
  const failedIds: string[] = [];

  for await (const line of getBatchResults(anthropicBatchId)) {
    const article_id = customIdMap[line.custom_id];
    if (!article_id) {
      console.warn(`[ingestSubspecialtyBatchResults] unknown custom_id: ${line.custom_id}`);
      continue;
    }

    if (line.result.type === "succeeded") {
      const rawText = (line.result.message!.content[0] as { type: string; text: string }).text.trim();
      const cls = parseSubspecialtyResponse(rawText, promptVersion, codeMap);

      const { error } = await admin
        .from("articles")
        .update({
          subspecialty:               cls.subspecialty,
          subspecialty_ai:            cls.subspecialty,
          subspecialty_model_version: cls.version,
          subspecialty_scored_at:     new Date().toISOString(),
          // subspecialty_reason is intentionally NOT written — that is Lab's territory
        })
        .eq("id", article_id);

      if (error) {
        console.error(`[ingestSubspecialtyBatchResults] DB update failed for ${article_id}: ${error.message}`);
        failedIds.push(article_id);
        continue;
      }

      void logScoringEvent(article_id, "subspecialty", {
        actor:   "system:batch-subspecialty" as EventActor,
        source:  "batch" as EventSource,
        version: cls.version,
        result:  cls.subspecialty,
      });

      recordBatchUsage({
        modelKey:         `subspecialty_${promptVersion}`,
        model:            line.result.message!.model,
        promptTokens:     line.result.message!.usage.input_tokens,
        completionTokens: line.result.message!.usage.output_tokens,
        articleId:        article_id,
        task:             "subspecialty",
      });

      scored++;
    } else {
      console.warn(`[ingestSubspecialtyBatchResults] non-succeeded result for ${article_id}: ${line.result.type}`);
      failedIds.push(article_id);
    }
  }

  return { scored, failed: failedIds.length, failedIds };
}
