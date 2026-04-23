// Thin wrapper around the Anthropic Batch API.
// No business logic, no DB access, no module-specific knowledge.

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env automatically

export type BatchRequest = {
  custom_id: string; // max 64 chars, unique per batch
  params: {
    model: string;
    max_tokens: number;
    system?: string;
    messages: { role: "user"; content: string }[];
    thinking?: { type: "disabled" };
  };
};

export async function submitBatch(
  requests: BatchRequest[]
): Promise<Anthropic.Messages.Batches.MessageBatch> {
  return client.messages.batches.create({
    requests: requests as Anthropic.Messages.Batches.BatchCreateParams["requests"],
  });
}

export async function getBatchStatus(
  anthropicBatchId: string
): Promise<Anthropic.Messages.Batches.MessageBatch> {
  return client.messages.batches.retrieve(anthropicBatchId);
}

export async function* getBatchResults(
  anthropicBatchId: string
): AsyncIterable<Anthropic.Messages.Batches.MessageBatchIndividualResponse> {
  const decoder = await client.messages.batches.results(anthropicBatchId);
  for await (const line of decoder) {
    yield line;
  }
}
