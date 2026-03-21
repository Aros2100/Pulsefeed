import { NextResponse } from "next/server";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runLocationParsing } from "@/lib/geo/location-scorer";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  after(async () => {
    try {
      const result = await runLocationParsing(500);
    } catch (e) {
      console.error("[geo/run-parse] failed:", e);
    }
  });

  return NextResponse.json({ ok: true });
}
