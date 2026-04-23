import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODEL_PRICING } from "./model-pricing";

const anthropic = new Anthropic();

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICING[model];
  if (!p) {
    console.error(`[tracked-client] UNKNOWN MODEL PRICING: "${model}" — cost_usd will be 0. Add to model-pricing.ts`);
    return 0;
  }
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

// Task string conventions (must match trackedCall calls in scorer.ts):
// - specialty scoring:      modelKey=`specialty_${version}`,           task="specialty"
// - subspecialty scoring:   modelKey=`subspecialty_${version}`,        task="subspecialty"
// - article_type prod:      modelKey=`article_type_prod_${version}`,   task="article_type"
// - condensation text:      modelKey=`condensation_${version}`,        task="condensation"
// - condensation sari:      modelKey=`condensation_sari_${version}`,   task="sari"

/**
 * Insert an api_usage row for a single Anthropic call executed via the Batch API.
 * Uses 50% batch discount on both input and output tokens.
 * Fire-and-forget — matches trackedCall behavior.
 */
export function recordBatchUsage(args: {
  modelKey: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  articleId?: string;
  task?: string;
}): void {
  const p = MODEL_PRICING[args.model];
  if (!p) {
    console.error(`[recordBatchUsage] UNKNOWN MODEL PRICING: "${args.model}" — cost_usd will be 0`);
  }
  const totalTokens = args.promptTokens + args.completionTokens;
  const fullPrice = p
    ? (args.promptTokens * p.input + args.completionTokens * p.output) / 1_000_000
    : 0;
  const batchPrice = fullPrice * 0.5; // 50% batch discount

  createAdminClient()
    .from("api_usage")
    .insert({
      model_key:         args.modelKey,
      prompt_tokens:     args.promptTokens,
      completion_tokens: args.completionTokens,
      total_tokens:      totalTokens,
      cost_usd:          batchPrice,
      article_id:        args.articleId ?? null,
      task:              args.task ?? null,
    })
    .then(({ error }) => {
      if (error) console.error("[api_usage] batch insert failed:", error.message);
    });
}

export async function trackedCall(
  modelKey: string,
  params: MessageCreateParamsNonStreaming,
  articleId?: string,
  task?: string
) {
  const response = await anthropic.messages.create({ ...params, stream: false }, { timeout: 60_000 });

  const promptTokens     = response.usage.input_tokens;
  const completionTokens = response.usage.output_tokens;
  const totalTokens      = promptTokens + completionTokens;
  const costUsd          = calcCost(params.model, promptTokens, completionTokens);

  // Fire-and-forget — don't block the caller
  createAdminClient()
    .from("api_usage")
    .insert({
      model_key:         modelKey,
      prompt_tokens:     promptTokens,
      completion_tokens: completionTokens,
      total_tokens:      totalTokens,
      cost_usd:          costUsd,
      article_id:        articleId ?? null,
      task:              task ?? null,
    })
    .then(({ error }) => {
      if (error) console.error("[api_usage] insert failed:", error.message);
    });

  return response;
}
