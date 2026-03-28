import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runLocationParsing } from "@/lib/geo/location-scorer";

export async function POST() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runLocationParsing(500);
    const done = result.parsed === 0 && result.skipped === 0;
    return NextResponse.json({ ok: true, ...result, done });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
