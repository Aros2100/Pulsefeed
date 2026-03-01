import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";
import { createAdminClient } from "@/lib/supabase/admin";

const anthropic = new Anthropic();

// Haiku pricing (per 1M tokens)
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4.00 },
};

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? { input: 0.80, output: 4.00 };
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export async function trackedCall(
  modelKey: string,
  params: MessageCreateParamsNonStreaming
) {
  const response = await anthropic.messages.create({ ...params, stream: false });

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
    })
    .then(({ error }) => {
      if (error) console.error("[api_usage] insert failed:", error.message);
    });

  return response;
}
