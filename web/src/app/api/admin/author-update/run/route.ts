import { NextResponse, type NextRequest, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runAuthorUpdateBatch } from "@/lib/import/author-import/update-authors";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let dryRun = false;
  try {
    const body = await request.json();
    if (typeof body.dryRun === "boolean") dryRun = body.dryRun;
  } catch { /* optional */ }

  const admin = createAdminClient();

  // Prevent concurrent runs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: running } = await (admin as any)
    .from("author_update_logs")
    .select("id")
    .eq("status", "running")
    .limit(1)
    .maybeSingle();

  if (running) {
    return NextResponse.json({ ok: false, error: "Already running" }, { status: 409 });
  }

  after(async () => {
    try {
      await runAuthorUpdateBatch({ dryRun, limit: 200, triggeredBy: "manual" });
    } catch (e) {
      console.error("[author-update/run] failed:", e);
    }
  });

  return NextResponse.json({ ok: true, dryRun });
}
