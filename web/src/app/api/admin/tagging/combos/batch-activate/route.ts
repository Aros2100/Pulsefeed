import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const schema = z.object({
  specialty: z.string(),
  pairs: z
    .array(z.object({ term_1: z.string(), term_2: z.string() }))
    .min(1)
    .max(200),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid input" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { specialty, pairs } = parsed.data;
  let activated = 0;

  for (const pair of pairs) {
    const t1 = pair.term_1 < pair.term_2 ? pair.term_1 : pair.term_2;
    const t2 = pair.term_1 < pair.term_2 ? pair.term_2 : pair.term_1;

    const { error } = await admin
      .from("tagging_rule_combos" as never)
      .upsert(
        {
          specialty,
          term_1: t1,
          term_2: t2,
          status: "active",
          activated_at: now,
          activated_by: auth.userId,
        } as never,
        { onConflict: "specialty,term_1,term_2" } as never
      );

    if (error) {
      console.error(`[tagging] combo batch-activate failed for ${t1} + ${t2}:`, error.message);
    } else {
      activated++;
    }
  }

  return NextResponse.json({ ok: true, activated });
}
