import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTY_SLUGS } from "@/lib/auth/specialties";

const schema = z.object({
  specialty: z.string().refine(
    (v) => (SPECIALTY_SLUGS as readonly string[]).includes(v),
    { message: "Invalid specialty" }
  ),
  verdicts: z.array(z.object({
    article_id: z.string().uuid(),
    verdict: z.enum(["relevant", "not_relevant"]),
    ai_confidence: z.number().int().min(0).max(100).nullable().optional(),
  })).min(1),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }

  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error.issues[0].message }, { status: 400 });
  }

  const { specialty, verdicts } = result.data;
  const admin = createAdminClient();

  const relevantIds = verdicts.filter((v) => v.verdict === "relevant").map((v) => v.article_id);
  const rejectedIds = verdicts.filter((v) => v.verdict === "not_relevant").map((v) => v.article_id);

  const [relevantResult, rejectedResult] = await Promise.all([
    relevantIds.length > 0
      ? admin.from("articles")
          .update({ verified: true, status: "approved", specialty_tags: [specialty] })
          .in("id", relevantIds)
      : Promise.resolve({ error: null }),
    rejectedIds.length > 0
      ? admin.from("articles")
          .update({ verified: false, status: "rejected" })
          .in("id", rejectedIds)
      : Promise.resolve({ error: null }),
  ]);

  if (relevantResult.error) {
    return NextResponse.json({ ok: false, error: relevantResult.error.message }, { status: 500 });
  }
  if (rejectedResult.error) {
    return NextResponse.json({ ok: false, error: rejectedResult.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    verified: relevantIds.length,
    rejected: rejectedIds.length,
  });
}
