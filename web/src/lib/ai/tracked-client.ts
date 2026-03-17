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
