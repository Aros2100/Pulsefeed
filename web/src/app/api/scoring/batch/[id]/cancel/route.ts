import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { failScoringRun } from "@/lib/scoring-runs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: row, error: fetchError } = await admin
    .from("scoring_batches")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !row) {
    return NextResponse.json({ ok: false, error: "Batch not found" }, { status: 404 });
  }

  if (row.status !== "submitted" && row.status !== "in_progress") {
    return NextResponse.json(
      { ok: false, error: `Batch is not in submitted or in_progress state (current: '${row.status}')` },
      { status: 400 }
    );
  }

  // Attempt Anthropic cancel — continue even if it fails (batch may already be ended on their side)
  let anthropicStatus: string | null = null;
  let cancelError: string | null = null;
  try {
    const anthropic = new Anthropic();
    const result = await anthropic.messages.batches.cancel(row.anthropic_batch_id);
    anthropicStatus = result.processing_status;
  } catch (e) {
    cancelError = (e as Error).message ?? String(e);
    console.error(`[batch/cancel] Anthropic cancel failed for ${row.anthropic_batch_id}:`, cancelError);
  }

  const errorField = cancelError
    ? `Cancel attempt: ${cancelError}`
    : "Cancelled by user";

  await admin
    .from("scoring_batches")
    .update({
      status:      "cancelled",
      error:       errorField,
      ingested_at: new Date().toISOString(), // sentinel: prevents auto-ingest
    })
    .eq("id", id);

  if (row.scoring_run_id) {
    void failScoringRun(row.scoring_run_id, errorField);
  }

  return NextResponse.json({ ok: true, status: "cancelled", anthropic_status: anthropicStatus });
}
