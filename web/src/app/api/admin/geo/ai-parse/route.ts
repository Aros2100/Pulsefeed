import { NextResponse } from "next/server";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runAILocationParsing } from "@/lib/geo/ai-location-scorer";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  after(async () => {
    try {
      const result = await runAILocationParsing(100);
      console.log("[geo/ai-parse]", result);
    } catch (e) {
      console.error("[geo/ai-parse] failed:", e);
    }
  });

  return NextResponse.json({ ok: true });
}
