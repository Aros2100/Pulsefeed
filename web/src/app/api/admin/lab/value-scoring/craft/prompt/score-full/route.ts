import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoreArticlesWithPrompt } from "@/lib/lab/value-scoring/scoring";

export const maxDuration = 300;

const schema = z.object({
  promptId: z.string().uuid(),
  // Set true to bypass the quick-test-first guard (the "Advanced: score all" path).
  force:    z.boolean().optional(),
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
  const { promptId, force } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Guard: full scoring requires quick test first unless force=true (Advanced path).
  if (!force) {
    const { data: prompt } = await admin
      .from("lab_value_prompts")
      .select("quick_tested_at")
      .eq("id", promptId)
      .maybeSingle();
    if (!prompt) {
      return NextResponse.json({ ok: false, error: "Prompt not found" }, { status: 404 });
    }
    if ((prompt as { quick_tested_at: string | null }).quick_tested_at === null) {
      return NextResponse.json({
        ok: false,
        error: "Run quick test first, or pass force=true to score all articles.",
      }, { status: 409 });
    }
  }

  try {
    const summary = await scoreArticlesWithPrompt(admin, promptId, "full");
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
