import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getBatchStatus } from "@/lib/scoring/batch/client";

const TERMINAL_STATUSES = new Set(["ingested", "failed", "cancelled", "expired"]);

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

  // Skip Anthropic call for terminal states
  if (TERMINAL_STATUSES.has(row.status)) {
    return NextResponse.json({ ok: true, batch: row, request_counts: null });
  }

  let anthropic;
  try {
    anthropic = await getBatchStatus(row.anthropic_batch_id);
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Anthropic API error: ${(e as Error).message}` }, { status: 502 });
  }

  // Map Anthropic processing_status → our status
  let newStatus: string = row.status;
  let newEndedAt: string | null = row.ended_at ?? null;

  if (anthropic.processing_status === "in_progress") {
    newStatus = "in_progress";
  } else if (anthropic.processing_status === "ended") {
    // Check for expiry: ended with no successes but some expired requests
    const counts = anthropic.request_counts;
    if (counts.expired > 0 && counts.succeeded === 0) {
      newStatus = "expired";
    } else {
      newStatus = "ended";
    }
    if (!newEndedAt) {
      newEndedAt = new Date().toISOString();
    }
  }
  // "canceling" → keep current status

  // Only update if something changed
  if (newStatus !== row.status || newEndedAt !== (row.ended_at ?? null)) {
    const { error: updateError } = await admin
      .from("scoring_batches")
      .update({ status: newStatus, ended_at: newEndedAt })
      .eq("id", id);

    if (updateError) {
      console.error("[batch/poll] update failed:", updateError.message);
    }
  }

  return NextResponse.json({
    ok:             true,
    batch:          { ...row, status: newStatus, ended_at: newEndedAt },
    request_counts: anthropic.request_counts,
  });
}
