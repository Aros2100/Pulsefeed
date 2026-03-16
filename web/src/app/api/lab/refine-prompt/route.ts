import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTY_SLUGS } from "@/lib/auth/specialties";
import { trackedCall } from "@/lib/ai/tracked-client";
import { SUBSPECIALTY_OPTIONS } from "@/lib/lab/classification-options";

const regressionCommentSchema = z.object({
  article_id: z.string().uuid(),
  title: z.string().optional(),
  comment: z.string().min(1),
});

const schema = z.object({
  current_prompt: z.string().min(10),
  feedback:       z.string().min(1),
  fp_patterns:    z.array(z.string()),
  fn_patterns:    z.array(z.string()),
  specialty:      z.string().refine(
    (v) => (SPECIALTY_SLUGS as readonly string[]).includes(v),
    { message: "Invalid specialty" }
  ),
  run_id: z.string().uuid().nullable().optional(),
  regression_comments: z.array(regressionCommentSchema).optional(),
});

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

  const { current_prompt, feedback, fp_patterns, fn_patterns, specialty, run_id, regression_comments } = parsed.data;

  const regressionSection = regression_comments && regression_comments.length > 0
    ? `\n\nThe domain expert also reviewed regression cases (articles where the new prompt disagrees with earlier correct decisions) and provided these comments:\n<regression_comments>\n${regression_comments.map((c, i) => `${i + 1}. ${c.title ? `"${c.title}" — ` : ""}${c.comment}`).join("\n")}\n</regression_comments>\n\nUse these regression comments to avoid introducing new errors while fixing the prompt.`
    : "";

  const promptForOptimization = current_prompt
    .replace(SUBSPECIALTY_OPTIONS.join(", "), "{{subspecialty_list}}");

  const userMessage = `You are refining an AI scoring prompt for ${specialty} article relevance.

The current candidate prompt is:
<current_prompt>
${promptForOptimization}
</current_prompt>

This prompt was generated based on these error patterns:
False positive patterns (AI too lenient): ${fp_patterns.join("; ")}
False negative patterns (AI too strict): ${fn_patterns.join("; ")}

The domain expert has reviewed the prompt and provided this feedback:
<feedback>
${feedback}
</feedback>${regressionSection}

Rewrite the prompt incorporating the expert's feedback while maintaining the corrections for the error patterns above. Keep {{title}}, {{abstract}}, and {{subspecialty_list}} as placeholders. Keep the JSON response format instruction at the end.

Respond with the refined prompt text only — no explanation, no markdown.`;

  try {
    const message = await trackedCall("refine_prompt", {
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: userMessage }],
    });

    const refined_prompt = (message.content[0] as { type: string; text: string }).text.trim();

    // Append iteration to model_optimization_runs if run_id provided
    if (run_id) {
      const admin = createAdminClient();

      type RunRow = { refinement_iterations: Array<{ feedback: string; resulting_prompt: string; timestamp: string }> | null };
      type RunResult = { data: RunRow | null; error: unknown };

      const { data: run } = await (
        admin
          .from("model_optimization_runs" as never)
          .select("refinement_iterations")
          .eq("id", run_id)
          .single() as unknown as Promise<RunResult>
      );

      const existing = run?.refinement_iterations ?? [];
      const newIteration = {
        feedback,
        resulting_prompt: refined_prompt,
        timestamp: new Date().toISOString(),
      };

      const updatedIterations = [...existing, newIteration];

      await (
        admin
          .from("model_optimization_runs" as never)
          .update({
            improved_prompt:         refined_prompt,
            refinement_iterations:   updatedIterations,
          } as never)
          .eq("id", run_id) as unknown as Promise<{ error: unknown }>
      );
    }

    return NextResponse.json({ ok: true, refined_prompt });
  } catch (e) {
    console.error("[refine-prompt] error:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
