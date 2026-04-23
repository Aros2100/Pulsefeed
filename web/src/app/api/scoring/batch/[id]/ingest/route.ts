import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { finishScoringRun, failScoringRun } from "@/lib/scoring-runs";
import { ingestSpecialtyBatchResults } from "@/lib/scoring/batch/specialty-batch";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Read row and verify preconditions
  const { data: row, error: fetchError } = await admin
    .from("scoring_batches")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !row) {
    return NextResponse.json({ ok: false, error: "Batch not found" }, { status: 404 });
  }

  if (row.status !== "ended") {
    return NextResponse.json(
      { ok: false, error: `Batch status is '${row.status}', must be 'ended' before ingesting` },
      { status: 400 }
    );
  }

  if (row.ingested_at !== null) {
    return NextResponse.json(
      { ok: false, error: "Batch has already been ingested" },
      { status: 400 }
    );
  }

  // Atomic lock: only proceed if status is still 'ended' and ingested_at is null
  const { data: locked, error: lockError } = await admin
    .from("scoring_batches")
    .update({ status: "ingesting" })
    .eq("id", id)
    .eq("status", "ended")
    .is("ingested_at", null)
    .select("id")
    .single();

  if (lockError || !locked) {
    return NextResponse.json(
      { ok: false, error: "Another ingest is in progress or batch is not in 'ended' state" },
      { status: 409 }
    );
  }

  let stats;
  try {
    stats = await ingestSpecialtyBatchResults(
      row.anthropic_batch_id,
      row.custom_id_map as Record<string, string>,
      row.specialty,
      row.prompt_version
    );
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[batch/ingest] ingest failed:", msg);

    await admin
      .from("scoring_batches")
      .update({ status: "failed", error: msg })
      .eq("id", id);

    if (row.scoring_run_id) {
      void failScoringRun(row.scoring_run_id, msg);
    }

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  await admin
    .from("scoring_batches")
    .update({
      status:      "ingested",
      ingested_at: new Date().toISOString(),
      stats: {
        scored:    stats.scored,
        approved:  stats.approved,
        rejected:  stats.rejected,
        failed:    stats.failed,
        failed_ids: stats.failedIds,
      },
    })
    .eq("id", id);

  if (row.scoring_run_id) {
    void finishScoringRun(row.scoring_run_id, stats.scored, stats.failed, row.article_count);
  }

  return NextResponse.json({ ok: true, stats });
}
