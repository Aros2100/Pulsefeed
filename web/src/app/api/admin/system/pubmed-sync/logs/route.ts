import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc("pubmed_sync_log_runs");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const runs = (data ?? []).map((row: {
    run_time: string;
    imported: string | number;
    updated: string | number;
    retracted: string | number;
    total: string | number;
  }) => ({
    runTime:   row.run_time,
    imported:  Number(row.imported),
    updated:   Number(row.updated),
    retracted: Number(row.retracted),
    total:     Number(row.total),
  }));

  return NextResponse.json({ ok: true, runs });
}
