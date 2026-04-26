import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runGeoBackfillDryRun } from "@/lib/geo/backfill-dry-run";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const result = await runGeoBackfillDryRun(200);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
