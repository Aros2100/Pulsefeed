import { NextResponse } from "next/server";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { reparseLowConfidence } from "@/lib/geo/location-scorer";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  after(async () => {
    try {
      const result = await reparseLowConfidence(new Date().toISOString(), 500);
      console.log("[geo/reparse-low]", result);
    } catch (e) {
      console.error("[geo/reparse-low] failed:", e);
    }
  });

  return NextResponse.json({ ok: true });
}
