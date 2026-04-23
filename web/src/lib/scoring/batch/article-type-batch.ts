// Article-type-specific batch orchestration.
// No HTTP, no API routes — pure functions called from route handlers.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getActivePrompt,
  buildArticleTypeProdRequest,
  parseArticleTypeProdResponse,
  type ActivePrompt,
} from "@/lib/lab/scorer";
import { logArticleEvent } from "@/lib/article-events";
import { recordBatchUsage } from "@/lib/ai/tracked-client";
import { getBatchResults, type BatchRequest } from "./client";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

type Article = {
  id: string;
  title: string;
  abstract: string | null;
  journal_abbr: string | null;
  journal_title: string | null;
  mesh_terms: unknown;
  publication_types: unknown;
};

async function fetchTypeCodeMap(): Promise<Map<number, string>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("article_types")
    .select("code, name")
    .eq("specialty", ACTIVE_SPECIALTY)
    .eq("active", true);
  return new Map<number, string>(
    ((data ?? []) as { code: number; name: string }[]).map((r) => [r.code, r.name])
  );
}

export async function prepareArticleTypeBatch(
  specialty: string,
  options: { limit?: number; edat_from?: string; edat_to?: string }
): Promise<{
  activePrompt: ActivePrompt;
  articles: Article[];
  requests: BatchRequest[];
  customIdMap: Record<string, string>;
  typeCodeMap: Map<number, string>;
}> {
  const activePrompt = await getActivePrompt(specialty, "article_type_prod");
  const typeCodeMap  = await fetchTypeCodeMap();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin.rpc("get_article_type_unscored_articles", {
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
    const custom_id = `atype_${article.id}`; // "atype_" + uuid = 42 chars, within 64-char limit
    customIdMap[custom_id] = article.id;
    requests.push({
      custom_id,
      params: buildArticleTypeProdRequest(article, activePrompt),
    });
  }

  return { activePrompt, articles, requests, customIdMap, typeCodeMap };
}

export async function ingestArticleTypeBatchResults(
  anthropicBatchId: string,
  customIdMap: Record<string, string>,
  promptVersion: string,
  typeCodeMap: Map<number, string>
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
      console.warn(`[ingestArticleTypeBatchResults] unknown custom_id: ${line.custom_id}`);
      continue;
    }

    if (line.result.type === "succeeded") {
      const rawText = (line.result.message!.content[0] as { type: string; text: string }).text.trim();
      const cls = parseArticleTypeProdResponse(rawText, promptVersion, typeCodeMap);

      const { error } = await admin
        .from("articles")
        .update({
          article_type:               cls.article_type,
          article_type_model_version: cls.version,
          article_type_scored_at:     new Date().toISOString(),
          article_type_method:        "ai",
          // article_type_ai, article_type_confidence, article_type_rationale,
          // article_type_validated are intentionally NOT written — those are Lab's territory
        })
        .eq("id", article_id);

      if (error) {
        console.error(`[ingestArticleTypeBatchResults] DB update failed for ${article_id}: ${error.message}`);
        failedIds.push(article_id);
        continue;
      }

      void logArticleEvent(article_id, "enriched", {
        module:       "article_type",
        article_type: cls.article_type,
        version:      cls.version,
      });

      recordBatchUsage({
        modelKey:         `article_type_prod_${promptVersion}`,
        model:            line.result.message!.model,
        promptTokens:     line.result.message!.usage.input_tokens,
        completionTokens: line.result.message!.usage.output_tokens,
        articleId:        article_id,
        task:             "article_type",
      });

      scored++;
    } else {
      console.warn(`[ingestArticleTypeBatchResults] non-succeeded result for ${article_id}: ${line.result.type}`);
      failedIds.push(article_id);
    }
  }

  return { scored, failed: failedIds.length, failedIds };
}
