import { NextResponse, type NextRequest, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runImport } from "@/specialties/neurosurgery/filter-c1";
import { runImportCircle4 } from "@/specialties/neurosurgery/filter-c4";
import { runImportCircle2 } from "@/specialties/neurosurgery/filter-c2";
import { runPubmedSync } from "@/lib/pubmed/sync-runner";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Check whether daily import is enabled
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: setting } = await admin
    .from("system_settings")
    .select("value")
    .eq("key", "daily_import_enabled")
    .maybeSingle();

  if (setting?.value === false) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  after(async () => {
    try {
      await runImport(undefined, false, undefined, "cron", 1);
      await runImportCircle4(undefined, false, undefined, "cron", 1);
      await runImportCircle2(ACTIVE_SPECIALTY, undefined, "cron", 1);
      await runPubmedSync({ daysBack: 1, esearchRetmax: 500 });
    } catch (e) {
      console.error("[trigger-import-daily] failed:", e);
    }
  });

  return NextResponse.json({ ok: true });
}
