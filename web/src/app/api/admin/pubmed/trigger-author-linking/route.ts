import { NextResponse, type NextRequest, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAuthorLinking } from "@/lib/import/author-linker";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Auto-cleanup: mark jobs stuck as 'running' for >30 min as failed
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  await admin
    .from("author_linking_logs")
    .update({ status: "failed", completed_at: new Date().toISOString(), errors: ["Auto-cleanup: job stuck for >30 minutes"] })
    .eq("status", "running")
    .lt("started_at", thirtyMinAgo);

  // Prevent concurrent runs
  const { data: running } = await admin
    .from("author_linking_logs")
    .select("id")
    .eq("status", "running")
    .limit(1)
    .maybeSingle();

  if (running) {
    return NextResponse.json(
      { ok: false, error: "A job is already running", logId: running.id },
      { status: 409 }
    );
  }

  const { data: log, error } = await admin
    .from("author_linking_logs")
    .insert({ status: "running" })
    .select("id")
    .single();

  if (error || !log) {
    return NextResponse.json({ ok: false, error: "Failed to create log entry" }, { status: 500 });
  }

  after(async () => {
    try {
      await runAuthorLinking(log.id);
    } catch (e) {
      console.error("[trigger-author-linking] failed:", e);
    }
  });

  return NextResponse.json({ ok: true, logId: log.id });
}
