import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoreValidationRun } from "@/lib/lab/value-scoring/validation";

// Scoring can take several minutes for large batches
export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { runId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  try {
    await scoreValidationRun(admin, runId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
