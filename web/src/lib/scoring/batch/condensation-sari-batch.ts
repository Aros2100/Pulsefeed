// Condensation-sari-specific batch orchestration.
// No HTTP, no API routes — pure functions called from route handlers.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getActivePrompt,
  buildCondensationSariRequest,
  parseCondensationSariResponse,
  type ActivePrompt,
} from "@/lib/lab/scorer";
import { logArticleEvent } from "@/lib/article-events";
import { recordBatchUsage } from "@/lib/ai/tracked-client";
import { getBatchResults, type BatchRequest } from "./client";

type RpcArticle = { id: string; title: string; abstract: string | null };
type FullArticle = RpcArticle & {
  short_headline: string | null;
  short_resume:   string | null;
  bottom_line:    string | null;
};

export async function prepareCondensationSariBatch(
  specialty: string,
  options: { limit?: number; edat_from?: string; edat_to?: string }
): Promise<{
  activePrompt: ActivePrompt;
  articles: FullArticle[];
  requests: BatchRequest[];
  customIdMap: Record<string, string>;
}> {
  const activePrompt = await getActivePrompt(specialty, "condensation_sari");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin.rpc("get_sari_unscored_articles", {
    p_specialty: specialty,
    p_limit:     options.limit ?? 10000,
    p_edat_from: options.edat_from ?? null,
    p_edat_to:   options.edat_to   ?? null,
  });

  if (error) throw new Error(`Failed to fetch unscored articles: ${error.message}`);

  const rpcArticles = (data ?? []) as RpcArticle[];

  // Fetch condensation fields needed by the SARI prompt
  let articles: FullArticle[] = [];
  if (rpcArticles.length > 0) {
    const ids = rpcArticles.map((a) => a.id);
    const { data: condRows } = await admin
      .from("articles")
      .select("id, short_headline, short_resume, bottom_line")
      .in("id", ids);

    const condMap = Object.fromEntries(
      ((condRows ?? []) as { id: string; short_headline: string | null; short_resume: string | null; bottom_line: string | null }[])
        .map((r) => [r.id, r])
    );
    articles = rpcArticles.map((a) => ({
      ...a,
      short_headline: condMap[a.id]?.short_headline ?? null,
      short_resume:   condMap[a.id]?.short_resume   ?? null,
      bottom_line:    condMap[a.id]?.bottom_line     ?? null,
    }));
  }

  const requests: BatchRequest[] = [];
  const customIdMap: Record<string, string> = {};

  for (const article of articles) {
    const custom_id = `sari_${article.id}`; // "sari_" + uuid = 41 chars, within 64-char limit
    customIdMap[custom_id] = article.id;
    requests.push({
      custom_id,
      params: buildCondensationSariRequest(article, activePrompt),
    });
  }

  return { activePrompt, articles, requests, customIdMap };
}

export async function ingestCondensationSariBatchResults(
  anthropicBatchId: string,
  customIdMap: Record<string, string>,
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
      console.warn(`[ingestCondensationSariBatchResults] unknown custom_id: ${line.custom_id}`);
      continue;
    }

    if (line.result.type === "succeeded") {
      const rawText = (line.result.message!.content[0] as { type: string; text: string }).text.trim();
      const sari = parseCondensationSariResponse(rawText, promptVersion);

      const { error } = await admin
        .from("articles")
        .update({
          sari_subject:       sari.sari_subject,
          sari_action:        sari.sari_action,
          sari_result:        sari.sari_result,
          sari_implication:   sari.sari_implication,
          sample_size:        sari.sample_size,
          sari_model_version: sari.version,
          sari_condensed_at:  new Date().toISOString(),
        })
        .eq("id", article_id);

      if (error) {
        console.error(`[ingestCondensationSariBatchResults] DB update failed for ${article_id}: ${error.message}`);
        failedIds.push(article_id);
        continue;
      }

      void logArticleEvent(article_id, "condensation_sari_scored", {
        module:  "condensation_sari",
        version: sari.version,
      });

      recordBatchUsage({
        modelKey:         `condensation_sari_${promptVersion}`,
        model:            line.result.message!.model,
        promptTokens:     line.result.message!.usage.input_tokens,
        completionTokens: line.result.message!.usage.output_tokens,
        articleId:        article_id,
        task:             "condensation_sari",
      });

      scored++;
    } else {
      console.warn(`[ingestCondensationSariBatchResults] non-succeeded result for ${article_id}: ${line.result.type}`);
      failedIds.push(article_id);
    }
  }

  return { scored, failed: failedIds.length, failedIds };
}
