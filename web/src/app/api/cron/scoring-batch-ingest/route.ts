import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: candidates, error } = await admin
    .from("scoring_batches")
    .select("id, module")
    .eq("status", "ended")
    .is("ingested_at", null)
    .order("ended_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error("[cron/scoring-batch-ingest] query failed:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, ingested: null, message: "no candidates" });
  }

  const batch = candidates[0];

  const url = new URL(`/api/scoring/batch/${batch.id}/ingest`, request.url);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.CRON_SECRET}` },
  });

  const result = await res.json().catch(() => ({}));
  return NextResponse.json({
    ok:      res.ok,
    batchId: batch.id,
    module:  batch.module,
    status:  res.status,
    result,
  });
}
