import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runAuthorLinking } from "@/lib/import/author-linker";

export const maxDuration = 300;

const schema = z.object({
  import_log_id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  // Allow cron calls via CRON_SECRET
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
  }

  let importLogId: string | undefined;
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (parsed.success) importLogId = parsed.data.import_log_id;
  } catch { /* body is optional */ }

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

  // Fire-and-forget
  after(() => runAuthorLinking(log.id, importLogId));

  return NextResponse.json({ ok: true, logId: log.id });
}
