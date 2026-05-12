import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePromptIterationFromDisagreements } from "@/lib/lab/value-scoring/prompt-iteration";

// Reading disagreements + a Sonnet call can take 30-90 seconds.
export const maxDuration = 120;

const schema = z.object({
  promptId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { promptId } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  try {
    const suggestion = await generatePromptIterationFromDisagreements(admin, promptId);
    return NextResponse.json({
      ok: true,
      promptText:         suggestion.promptText,
      changeNotes:        suggestion.changeNotes,
      disagreementCount:  suggestion.disagreementCount,
      promptVersion:      suggestion.promptVersion,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
