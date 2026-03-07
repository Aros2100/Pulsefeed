import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const importCutoff       = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const authorLinkingCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const [importRes, authorRes] = await Promise.all([
    admin
      .from("import_logs")
      .update({
        status:       "failed",
        completed_at: now,
        errors:       ["Job timed out — cleaned up automatically"],
      })
      .eq("status", "running")
      .lt("started_at", importCutoff)
      .select("id"),

    admin
      .from("author_linking_logs")
      .update({
        status:       "failed",
        completed_at: now,
        errors:       ["Job timed out — cleaned up automatically"],
      })
      .eq("status", "running")
      .lt("started_at", authorLinkingCutoff)
      .select("id"),
  ]);

  if (importRes.error) {
    return NextResponse.json({ ok: false, error: importRes.error.message }, { status: 500 });
  }
  if (authorRes.error) {
    return NextResponse.json({ ok: false, error: authorRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok:                       true,
    import_logs_fixed:        (importRes.data ?? []).length,
    author_linking_logs_fixed: (authorRes.data ?? []).length,
  });
}
