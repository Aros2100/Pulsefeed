import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { getActivePrompt, ANALYSIS_MODEL } from "@/lib/lab/scorer";
import { trackedCall } from "@/lib/ai/tracked-client";
import { getSubspecialties } from "@/lib/lab/classification-options";

const schema = z.object({
  specialty: z.string().refine(
    (v) => v === ACTIVE_SPECIALTY,
    { message: "Invalid specialty" }
  ),
  module: z.string().min(1),
});

type DisagreementRow = {
  decision: string;
  ai_decision: string;
  disagreement_reason: string | null;
  comment: string | null;
  articles: { title: string; abstract: string | null } | null;
};

export interface PatternAnalysisResult {
  false_positive_patterns: string[];
  false_negative_patterns: string[];
  recommended_changes: string;
  improved_prompt: string;
  current_prompt: string;
  run_id: string | null;
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
    .select("decision, ai_decision, disagreement_reason, comment, articles!inner(title, abstract)")
    .eq("specialty", specialty)
    .eq("module", module)
    .not("ai_decision", "is", null)
    .order("decided_at", { ascending: false });

  if (fetchError) {
    return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 });
  }

  const isClassification = module === "subspecialty";
  const isCondensation   = module.startsWith("condensation");

  // Condensation: all rejections are quality issues (ai_decision is always "approved")
  // Others: disagreements (human != AI)
  const rows = ((rawData ?? []) as unknown as DisagreementRow[])
    .filter((d) => isCondensation
      ? d.decision === "rejected"
      : d.decision !== d.ai_decision
    );

  const falsePositives = (isClassification || isCondensation) ? [] : rows.filter((d) => d.ai_decision === "approved" && d.decision === "rejected");
  const falseNegatives = (isClassification || isCondensation) ? [] : rows.filter((d) => d.ai_decision === "rejected"  && d.decision === "approved");

  // Fetch active prompt
  let activePrompt: { prompt: string; version: string };
  try {
    activePrompt = await getActivePrompt(specialty, module);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 422 });
  }

  const subspecialties = await getSubspecialties(specialty);

  const promptForOptimization = activePrompt.prompt
    .replace(subspecialties.join(", "), "{{subspecialty_list}}");

  let userMessage: string;

  if (isClassification) {
    // Classification: disagreements are subspecialty array corrections
    const correctionList = rows.slice(0, 50).map((d, i) => {
      const title    = d.articles?.title ?? "Unknown title";
      const abstract = d.articles?.abstract
        ? d.articles.abstract.slice(0, 300) + (d.articles.abstract.length > 300 ? "…" : "")
        : "No abstract";
      const reason   = d.disagreement_reason ? `\n  Reason: ${d.disagreement_reason}` : "";
      return `${i + 1}. ${title}\n  AI classified as: ${d.ai_decision}\n  Human corrected to: ${d.decision}${reason}\n  Abstract: ${abstract}`;
    }).join("\n\n");

    userMessage = `You are analyzing subspecialty classification disagreements between an AI model and a human expert neurosurgeon.

The AI used this prompt (version: ${activePrompt.version}):
<current_prompt>
${promptForOptimization}
</current_prompt>

CORRECTIONS — Human changed AI's subspecialty tags (${rows.length} cases):
${correctionList}

Analyze the TRENDS — not individual articles. Identify:
1. What subspecialties does the AI over-assign? (max 5 patterns, put in false_positive_patterns)
2. What subspecialties does the AI under-assign or miss? (max 5 patterns, put in false_negative_patterns)
3. What specific changes to the prompt would improve classification accuracy?
4. Write an improved prompt. Must use {{title}}, {{abstract}}, and {{subspecialty_list}} as placeholders.

Respond in JSON only — no markdown, no backticks:
{
  "false_positive_patterns": ["pattern 1", ...],
  "false_negative_patterns": ["pattern 1", ...],
  "recommended_changes": "...",
  "improved_prompt": "..."
}`;
  } else if (module === "condensation_sari") {
    const rejectionList = rows.slice(0, 50).map((d, i) => {
      const title    = d.articles?.title ?? "Unknown title";
      const abstract = d.articles?.abstract
        ? d.articles.abstract.slice(0, 300) + (d.articles.abstract.length > 300 ? "…" : "")
        : "No abstract";
      const reason     = d.disagreement_reason ? `\n  Reason: ${d.disagreement_reason}` : "";
      const commentStr = d.comment ? `\n  Field feedback: ${d.comment}` : "";
      return `${i + 1}. ${title}${reason}${commentStr}\n  Abstract: ${abstract}`;
    }).join("\n\n");

    userMessage = `You are analyzing cases where an AI model's SARI output was rejected by a human expert neurosurgeon. SARI stands for Subject, Action, Result, Implication — a 4-field structured summary of a research article.

The AI used this prompt (version: ${activePrompt.version}):

<current_prompt>
${promptForOptimization}
</current_prompt>

REJECTED SARI OUTPUTS — Human expert rejected the AI's SARI fields (${rows.length} cases):
${rejectionList}

Analyze the TRENDS — not individual articles. The rejection reasons are structured as field-level feedback (S/A/R/I/N keys). Focus on which SARI fields are most often wrong and why.

Identify:
1. What quality issues appear most often in rejected SARI fields? (max 5 patterns, put in false_positive_patterns)
2. What content is consistently missing or incomplete in the SARI output? (max 5 patterns, put in false_negative_patterns)
3. What specific changes to the prompt would improve SARI output quality?
4. Write an improved prompt. Must use {{title}} and {{abstract}} as placeholders. The prompt must still produce all condensation fields (short_headline, short_resume, bottom_line, sari_subject, sari_action, sari_result, sari_implication, sample_size) — do NOT remove any fields.

Respond in JSON only — no markdown, no backticks:
{
  "false_positive_patterns": ["pattern 1", ...],
  "false_negative_patterns": ["pattern 1", ...],
  "recommended_changes": "...",
  "improved_prompt": "..."
}`;
  } else if (isCondensation) {
    const rejectionList = rows.slice(0, 50).map((d, i) => {
      const title    = d.articles?.title ?? "Unknown title";
      const abstract = d.articles?.abstract
        ? d.articles.abstract.slice(0, 300) + (d.articles.abstract.length > 300 ? "…" : "")
        : "No abstract";
      const reason   = d.disagreement_reason ? `\n  Reason: ${d.disagreement_reason}` : "";
      return `${i + 1}. ${title}${reason}\n  Abstract: ${abstract}`;
    }).join("\n\n");

    userMessage = `You are analyzing cases where an AI condensation model's output was rejected by a human expert neurosurgeon.

The AI used this prompt (version: ${activePrompt.version}):
<current_prompt>
${promptForOptimization}
</current_prompt>

REJECTED CONDENSATIONS — Human expert rejected the AI's condensed output (${rows.length} cases):
${rejectionList}

Analyze the TRENDS — not individual articles. Identify:
1. What quality issues appear most often in rejected condensations? (max 5 patterns, put in false_positive_patterns)
2. What content gaps or missing elements caused rejections? (max 5 patterns, put in false_negative_patterns)
3. What specific changes to the prompt would reduce rejections?
4. Write an improved prompt. Must use {{title}} and {{abstract}} as placeholders.

Respond in JSON only — no markdown, no backticks:
{
  "false_positive_patterns": ["pattern 1", ...],
  "false_negative_patterns": ["pattern 1", ...],
  "recommended_changes": "...",
  "improved_prompt": "..."
}`;
  } else {
    userMessage = `You are analyzing disagreements between an AI scoring model and a human expert neurosurgeon.

The AI used this prompt (version: ${activePrompt.version}):
<current_prompt>
${promptForOptimization}
</current_prompt>

FALSE POSITIVES — AI approved, human rejected (${falsePositives.length} cases):
${formatList(falsePositives)}

FALSE NEGATIVES — AI rejected, human approved (${falseNegatives.length} cases):
${formatList(falseNegatives)}

Analyze the TRENDS — not individual articles. Identify:
1. What categories of articles does the AI incorrectly approve? (max 5 patterns)
2. What categories of articles does the AI incorrectly reject? (max 5 patterns)
3. What specific changes to the prompt would fix these trends?
4. Write an improved prompt. Must use {{title}}, {{abstract}}, and {{subspecialty_list}} as placeholders.

Respond in JSON only — no markdown, no backticks:
{
  "false_positive_patterns": ["pattern 1", ...],
  "false_negative_patterns": ["pattern 1", ...],
  "recommended_changes": "...",
  "improved_prompt": "..."
}`;
  }

  try {
    const message = await trackedCall("pattern_analysis", {
      model: ANALYSIS_MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: userMessage }],
    }, undefined, specialty);

    const raw = (message.content[0] as { type: string; text: string }).text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as Omit<PatternAnalysisResult, "current_prompt" | "run_id">;


    type InsertResult = { data: Array<{ id: string }> | null; error: { message: string; code: string } | null };
    const { data: insertData, error: insertError } = await (
      admin
        .from("model_optimization_runs")
        .insert({
          specialty,
          module,
          base_version:        activePrompt.version,
          total_decisions:     rows.length,
          fp_count:            isClassification ? rows.length : isCondensation ? rows.length : falsePositives.length,
          fn_count:            isClassification ? rows.length : isCondensation ? 0            : falseNegatives.length,
          fp_patterns:         result.false_positive_patterns,
          fn_patterns:         result.false_negative_patterns,
          recommended_changes: result.recommended_changes,
          improved_prompt:     result.improved_prompt,
        })
        .select("id") as unknown as Promise<InsertResult>
    );

    if (insertError) {
      console.error("[analyze-patterns] DB insert failed:", JSON.stringify(insertError));
    } else {
    }

    const runId = insertData?.[0]?.id ?? null;

    return NextResponse.json({
      ok: true,
      ...result,
      current_prompt: activePrompt.prompt,
      run_id: runId,
    });
  } catch (e) {
    console.error("[analyze-patterns] unexpected error:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
