import { trackedCall } from "@/lib/ai/tracked-client";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ScoreResult {
  confidence: number;
  ai_decision: "approved" | "rejected";
}

export interface ActivePrompt {
  prompt: string;
  version: string;
}

export async function getActivePrompt(specialty: string, module: string): Promise<ActivePrompt> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("model_versions")
    .select("prompt_text, version")
    .eq("specialty", specialty)
    .eq("module", module)
    .eq("active", true)
    .limit(1)
    .single();

  if (!data?.prompt_text || !data?.version) {
    throw new Error(`No active prompt found for specialty: ${specialty}, module: ${module}`);
  }

  return { prompt: data.prompt_text as string, version: data.version as string };
}

export async function scoreArticle(
  article: { title: string; abstract: string | null },
  specialty: string,
  activePrompt: ActivePrompt
): Promise<ScoreResult & { version: string }> {
  const content = activePrompt.prompt
    .replace(/\{specialty\}/g, specialty)
    .replace(/\{title\}/g,    article.title)
    .replace(/\{abstract\}/g, article.abstract ?? "No abstract available");

  const message = await trackedCall("specialty_tag_v1", {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [{ role: "user", content }],
  });

  const raw = (message.content[0] as { type: string; text: string }).text.trim();

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as { decision?: string; confidence?: number };
    const confidence = Math.min(100, Math.max(0, Math.round(Number(parsed.confidence ?? 50))));
    const ai_decision: "approved" | "rejected" = parsed.decision === "approved" ? "approved" : "rejected";
    return { confidence, ai_decision, version: activePrompt.version };
  } catch {
    const match = raw.match(/\d+/);
    const confidence = match ? Math.min(100, Math.max(0, parseInt(match[0], 10))) : 50;
    return { confidence, ai_decision: confidence >= 50 ? "approved" : "rejected", version: activePrompt.version };
  }
}
