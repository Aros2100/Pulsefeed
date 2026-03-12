import { NextResponse } from "next/server";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runAILocationParsing } from "@/lib/geo/ai-location-scorer";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  after(async () => {
    try {
      let totalProcessed = 0;
      let totalUpgraded = 0;
      let totalConflicted = 0;
      let totalFailed = 0;

      while (true) {
        const result = await runAILocationParsing(100);
        totalProcessed += result.processed;
        totalUpgraded += result.upgraded;
        totalConflicted += result.conflicted;
        totalFailed += result.failed;

        console.log("[geo/ai-parse] batch done:", result);

        if (result.processed === 0) break;
      }

      console.log("[geo/ai-parse] ALL DONE:", { totalProcessed, totalUpgraded, totalConflicted, totalFailed });
    } catch (e) {
      console.error("[geo/ai-parse] failed:", e);
    }
  });

  return NextResponse.json({ ok: true });
}
