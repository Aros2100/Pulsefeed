import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runAuthorLinking } from "@/lib/pubmed/author-linker";

const schema = z.object({
  import_log_id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let importLogId: string | undefined;
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (parsed.success) importLogId = parsed.data.import_log_id;
  } catch { /* body is optional */ }

  const admin = createAdminClient();

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
  void runAuthorLinking(log.id, importLogId);

  return NextResponse.json({ ok: true, logId: log.id });
}
