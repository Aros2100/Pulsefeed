import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db.rpc("pubmed_sync_failures_summary");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    ok: true,
    totalUnresolved: Number(row?.total_unresolved ?? 0),
    oldestFailure:   row?.oldest_failure ?? null,
    recentFailures:  row?.recent_failures ?? [],
  });
}
