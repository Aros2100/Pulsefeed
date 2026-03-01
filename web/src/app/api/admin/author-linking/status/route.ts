import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const [logsResult, unlinkedResult] = await Promise.all([
    admin
      .from("author_linking_logs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(5),
    admin.rpc("count_unlinked_articles"),
  ]);

  return NextResponse.json({
    ok: true,
    latest: logsResult.data?.[0] ?? null,
    logs: logsResult.data ?? [],
    unlinkedCount: (unlinkedResult.data as number | null) ?? 0,
  });
}
