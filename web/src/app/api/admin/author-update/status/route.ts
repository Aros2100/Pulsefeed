import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const [pendingResult, logsResult] = await Promise.all([
    admin.from("articles").select("id", { count: "exact", head: true })
      .eq("authors_changed", true)
      .not("authors_raw_new", "is", null),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("author_update_logs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({
    ok: true,
    pendingCount: pendingResult.count ?? 0,
    logs: logsResult.data ?? [],
  });
}
