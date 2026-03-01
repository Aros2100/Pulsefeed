import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runAuthorLinking } from "@/lib/pubmed/author-linker";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

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
  void runAuthorLinking(log.id);

  return NextResponse.json({ ok: true, logId: log.id });
}
