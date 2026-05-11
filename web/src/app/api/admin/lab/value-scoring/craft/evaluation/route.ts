import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computePairMatch,
  computeRankingCorrelation,
  getDisagreements,
} from "@/lib/lab/value-scoring/evaluation";

const querySchema = z.object({
  promptId:     z.string().uuid(),
  minScoreDiff: z.coerce.number().optional(),
  includeTies:  z.enum(["true", "false"]).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { promptId, minScoreDiff, includeTies } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  try {
    const [pairMatch, correlation, disagreements] = await Promise.all([
      computePairMatch(admin, promptId),
      computeRankingCorrelation(admin, promptId),
      getDisagreements(admin, promptId, {
        minScoreDiff: minScoreDiff ?? 0,
        includeTies:  includeTies === "true",
      }),
    ]);
    return NextResponse.json({ ok: true, pairMatch, correlation, disagreements });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
