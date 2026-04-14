import { NextResponse, type NextRequest, after } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runImportCircle4 } from "@/specialties/neurosurgery/filter-c4";
import { runCitationFetch } from "@/lib/import/fetch-citations";
import { runAILocationParsing } from "@/lib/geo/ai-location-scorer";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let mindate: string | undefined;
  let maxdate: string | undefined;
  try {
    const body = (await request.json()) as { mindate?: string; maxdate?: string };
    mindate = body.mindate || undefined;
    maxdate = body.maxdate || undefined;
  } catch {
    // Body is optional
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // Guard: check if a C4 import is already running
  const { count } = await db
    .from("import_logs")
    .select("id", { count: "exact", head: true })
    .eq("status", "running")
    .eq("circle", 4) as { count: number | null };

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { ok: false, error: "C4 import kører allerede — vent til den er færdig" },
      { status: 409 }
    );
  }

  after(async () => {
    await runImportCircle4(undefined, false, undefined, "manual", undefined, mindate, maxdate);
  });

  after(async () => {
    await runCitationFetch(200);
  });

  after(async () => {
    try {
      await runAILocationParsing(200);
    } catch (e) {
      console.error("[geo/ai-parse] failed:", e);
    }
  });

  return NextResponse.json({ ok: true });
}
