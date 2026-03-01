import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTY_SLUGS } from "@/lib/auth/specialties";

const schema = z.object({
  article_id: z.string().uuid(),
  specialty: z.string().refine((v) => (SPECIALTY_SLUGS as readonly string[]).includes(v), {
    message: "Invalid specialty",
  }),
  editor_verdict: z.enum(["relevant", "not_relevant", "unsure"]),
  ai_verdict: z.enum(["relevant", "not_relevant", "unsure"]).nullable().optional(),
  ai_confidence: z.number().int().min(0).max(100).nullable().optional(),
  disagreement_reason: z.string().optional(),
  disagreement_comment: z.string().max(200).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { ok: false, error: result.error.issues[0].message },
      { status: 400 }
    );
  }

  const { article_id, specialty, editor_verdict, ai_verdict, ai_confidence, disagreement_reason, disagreement_comment } =
    result.data;

  const agreement =
    ai_verdict != null ? editor_verdict === ai_verdict : null;

  const admin = createAdminClient();

  const { error: insertError } = await admin.from("lab_decisions").insert({
    article_id,
    specialty,
    editor_verdict,
    ai_verdict: ai_verdict ?? null,
    ai_confidence: ai_confidence ?? null,
    agreement,
    disagreement_reason: disagreement_reason ?? null,
    disagreement_comment: disagreement_comment ?? null,
  });

  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  if (editor_verdict === "relevant") {
    const { error: updateError } = await admin
      .from("articles")
      .update({ specialty_tags: [specialty], verified: true })
      .eq("id", article_id);
    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }
  } else if (editor_verdict === "not_relevant") {
    const { error: updateError } = await admin
      .from("articles")
      .update({ specialty_tags: [], verified: false })
      .eq("id", article_id);
    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }
  }
  // unsure: no article update

  return NextResponse.json({ ok: true });
}
