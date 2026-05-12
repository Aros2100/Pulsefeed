import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoreArticlesWithPrompt } from "@/lib/lab/value-scoring/scoring";
import { SCORING_MODEL } from "@/lib/lab/value-scoring/craft-config";

// Quick test scores 15 articles — usually well under a minute.
export const maxDuration = 120;

// Allowed models for quick test scoring
const ALLOWED_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-7",
] as const;

const schema = z.object({
  promptId: z.string().uuid(),
  model:    z.enum(ALLOWED_MODELS).optional(),
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
  const { promptId, model } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  try {
    const summary = await scoreArticlesWithPrompt(admin, promptId, "quick", model ?? SCORING_MODEL);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
