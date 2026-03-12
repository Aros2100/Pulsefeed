import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("get_geo_status" as never);

  if (error) {
    // Fallback: run raw query via individual counts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = admin as any;

    const [parsedRes, highRes, lowRes, unparsedRes, aiAttemptedRes, aiUpgradedRes, aiConflictedRes, aiRemainingRes, totalRes] =
      await Promise.all([
        a.from("articles").select("id", { count: "exact", head: true }).not("location_parsed_at", "is", null),
        a.from("articles").select("id", { count: "exact", head: true }).eq("location_confidence", "high"),
        a.from("articles").select("id", { count: "exact", head: true }).eq("location_confidence", "low"),
        a.from("articles").select("id", { count: "exact", head: true }).is("location_parsed_at", null).not("authors", "is", null).neq("authors", "[]"),
        a.from("articles").select("id", { count: "exact", head: true }).eq("ai_location_attempted", true),
        a.from("articles").select("id", { count: "exact", head: true }).eq("ai_location_attempted", true).eq("location_confidence", "high"),
        a.from("articles").select("id", { count: "exact", head: true }).eq("ai_location_attempted", true).eq("location_confidence", "low"),
        a.from("articles").select("id", { count: "exact", head: true }).eq("location_confidence", "low").eq("ai_location_attempted", false),
        a.from("articles").select("id", { count: "exact", head: true }),
      ] as Promise<{ count: number | null }>[]);

    const parsed = (parsedRes as { count: number | null }).count ?? 0;
    const total = (totalRes as { count: number | null }).count ?? 0;

    return NextResponse.json({
      parsed,
      high_confidence: (highRes as { count: number | null }).count ?? 0,
      low_confidence: (lowRes as { count: number | null }).count ?? 0,
      unparsed: (unparsedRes as { count: number | null }).count ?? 0,
      ai_attempted: (aiAttemptedRes as { count: number | null }).count ?? 0,
      ai_upgraded: (aiUpgradedRes as { count: number | null }).count ?? 0,
      ai_conflicted: (aiConflictedRes as { count: number | null }).count ?? 0,
      ai_remaining: (aiRemainingRes as { count: number | null }).count ?? 0,
      total,
      pct: total > 0 ? Math.round((parsed / total) * 100) : 0,
    });
  }

  // RPC returned data — normalize
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, number> | null;
  const parsed = row?.parsed ?? 0;
  const total = (row?.parsed ?? 0) + (row?.unparsed ?? 0) + ((row?.high_confidence ?? 0) + (row?.low_confidence ?? 0) - (row?.parsed ?? 0));
  const totalFromCounts = (await admin.from("articles").select("id", { count: "exact", head: true })).count ?? 0;

  return NextResponse.json({
    ...row,
    total: totalFromCounts,
    pct: totalFromCounts > 0 ? Math.round((parsed / totalFromCounts) * 100) : 0,
  });
}
