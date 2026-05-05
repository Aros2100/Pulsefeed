import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("[cron/scoring-batch-poll] CRON_SECRET not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: batches, error: fetchErr } = await admin
    .from("scoring_batches")
    .select("id, anthropic_batch_id, status")
    .in("status", ["submitted", "in_progress"])
    .order("submitted_at", { ascending: true });

  if (fetchErr) {
    console.error("[cron/scoring-batch-poll] DB query failed:", fetchErr);
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  }

  if (!batches || batches.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, changed: 0 });
  }

  let changed = 0;
  const errors: string[] = [];

  for (const batch of batches as { id: string; anthropic_batch_id: string; status: string }[]) {
    try {
      const anthropicBatch = await anthropic.messages.batches.retrieve(batch.anthropic_batch_id);

      let newStatus: string | null = null;
      if (anthropicBatch.processing_status === "in_progress") {
        if (batch.status !== "in_progress") newStatus = "in_progress";
      } else if (anthropicBatch.processing_status === "ended") {
        const counts = anthropicBatch.request_counts;
        const isExpired = counts.expired > 0 && counts.succeeded === 0;
        newStatus = isExpired ? "expired" : "ended";
      }

      if (newStatus && newStatus !== batch.status) {
        const updates: Record<string, unknown> = { status: newStatus };
        if ((newStatus === "ended" || newStatus === "expired") && anthropicBatch.ended_at) {
          updates.ended_at = anthropicBatch.ended_at;
        }
        const { error: updateErr } = await admin
          .from("scoring_batches")
          .update(updates)
          .eq("id", batch.id);

        if (updateErr) {
          errors.push(`${batch.id}: update failed: ${updateErr.message}`);
        } else {
          changed++;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${batch.id}: ${msg}`);
      console.error(`[cron/scoring-batch-poll] poll failed for ${batch.id}:`, msg);
    }
  }

  return NextResponse.json({
    ok: true,
    checked: batches.length,
    changed,
    errors: errors.length > 0 ? errors : undefined,
  });
}
