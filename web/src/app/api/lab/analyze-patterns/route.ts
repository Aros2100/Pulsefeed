import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTY_SLUGS } from "@/lib/auth/specialties";
import { getActivePrompt } from "@/lib/lab/scorer";
import { trackedCall } from "@/lib/ai/tracked-client";

const schema = z.object({
  specialty: z.string().refine(
    (v) => (SPECIALTY_SLUGS as readonly string[]).includes(v),
    { message: "Invalid specialty" }
  ),
  module: z.string().min(1),
});

type DisagreementRow = {
  decision: string;
  ai_decision: string;
  disagreement_reason: string | null;
  articles: { title: string; abstract: string | null } | null;
};

export interface PatternAnalysisResult {
  false_positive_patterns: string[];
  false_negative_patterns: string[];
  recommended_changes: string;
  improved_prompt: string;
  current_prompt: string;
}

function formatList(items: DisagreementRow[], max = 50): string {
  return items.slice(0, max).map((d, i) => {
    const title    = d.articles?.title ?? "Unknown title";
    const abstract = d.articles?.abstract
      ? d.articles.abstract.slice(0, 300) + (d.articles.abstract.length > 300 ? "…" : "")
      : "No abstract";
    const reason   = d.disagreement_reason ? `\n  Reason: ${d.disagreement_reason}` : "";
    return `${i + 1}. ${title}${reason}\n  Abstract: ${abstract}`;
  }).join("\n\n");
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { specialty, module } = parsed.data;
  const admin = createAdminClient();

  // Fetch disagreements joined with article details
  const { data: rawData, error: fetchError } = await admin
    .from("lab_decisions")
    .select("decision, ai_decision, disagreement_reason, articles!inner(title, abstract)")
    .eq("specialty", specialty)
    .eq("module", module)
    .not("ai_decision", "is", null)
    .order("decided_at", { ascending: false });

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  const rows = ((rawData ?? []) as unknown as DisagreementRow[])
    .filter((d) => d.decision !== d.ai_decision);

  const falsePositives = rows.filter((d) => d.ai_decision === "approved" && d.decision === "rejected");
  const falseNegatives = rows.filter((d) => d.ai_decision === "rejected"  && d.decision === "approved");

  // Fetch active prompt
  let activePrompt: { prompt: string; version: string };
  try {
    activePrompt = await getActivePrompt(specialty, module);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 422 });
  }

  const userMessage = `You are analyzing disagreements between an AI scoring model and a human expert neurosurgeon.

The AI used this prompt (version: ${activePrompt.version}):
<current_prompt>
${activePrompt.prompt}
</current_prompt>

FALSE POSITIVES — AI approved, human rejected (${falsePositives.length} cases):
${formatList(falsePositives)}

FALSE NEGATIVES — AI rejected, human approved (${falseNegatives.length} cases):
${formatList(falseNegatives)}

Analyze the TRENDS — not individual articles. Identify:
1. What categories of articles does the AI incorrectly approve? (max 5 patterns)
2. What categories of articles does the AI incorrectly reject? (max 5 patterns)
3. What specific changes to the prompt would fix these trends?
4. Write an improved prompt. Must use {{title}} and {{abstract}} as placeholders.

Respond in JSON only — no markdown, no backticks:
{
  "false_positive_patterns": ["pattern 1", ...],
  "false_negative_patterns": ["pattern 1", ...],
  "recommended_changes": "...",
  "improved_prompt": "..."
}`;

  try {
    const message = await trackedCall("pattern_analysis", {
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = (message.content[0] as { type: string; text: string }).text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as Omit<PatternAnalysisResult, "current_prompt">;

    // Persist to DB (fire-and-forget — don't block response)
    admin.from("model_optimization_runs" as never).insert({
      specialty,
      module,
      base_version:        activePrompt.version,
      base_prompt_text:    activePrompt.prompt,
      total_decisions:     rows.length,
      fp_count:            falsePositives.length,
      fn_count:            falseNegatives.length,
      fp_patterns:         result.false_positive_patterns,
      fn_patterns:         result.false_negative_patterns,
      recommended_changes: result.recommended_changes,
      improved_prompt:     result.improved_prompt,
    } as never).then(({ error }: { error: unknown }) => {
      if (error) console.error("[analyze-patterns] DB insert failed:", error);
    });

    return NextResponse.json({ ok: true, ...result, current_prompt: activePrompt.prompt });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
