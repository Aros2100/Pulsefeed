import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const [parsedRes, highRes, lowRes, unparsedRes, aiAttemptedRes, aiUpgradedRes, aiConflictedRes, aiRemainingRes, totalRes] =
    await Promise.all([
      admin.from("articles").select("id", { count: "exact", head: true }).not("geo_defined_at", "is", null),
      admin.from("articles").select("id", { count: "exact", head: true }).eq("geo_parser_confidence", "high"),
      admin.from("articles").select("id", { count: "exact", head: true }).eq("geo_parser_confidence", "low"),
      admin.from("articles").select("id", { count: "exact", head: true }).is("geo_defined_at", null).not("authors", "is", null).neq("authors", "[]"),
      admin.from("articles").select("id", { count: "exact", head: true }).eq("ai_location_attempted", true),
      admin.from("articles").select("id", { count: "exact", head: true }).eq("ai_location_attempted", true).eq("geo_parser_confidence", "high"),
      admin.from("articles").select("id", { count: "exact", head: true }).eq("ai_location_attempted", true).eq("geo_parser_confidence", "low"),
      admin.from("articles").select("id", { count: "exact", head: true }).eq("geo_parser_confidence", "low").eq("ai_location_attempted", false),
      admin.from("articles").select("id", { count: "exact", head: true }),
    ]);

  const parsed = parsedRes.count ?? 0;
  const total  = totalRes.count ?? 0;

  return NextResponse.json({
    parsed,
    high_confidence: highRes.count ?? 0,
    low_confidence:  lowRes.count ?? 0,
    unparsed:        unparsedRes.count ?? 0,
    ai_attempted:    aiAttemptedRes.count ?? 0,
    ai_upgraded:     aiUpgradedRes.count ?? 0,
    ai_conflicted:   aiConflictedRes.count ?? 0,
    ai_remaining:    aiRemainingRes.count ?? 0,
    total,
    pct: total > 0 ? Math.round((parsed / total) * 100) : 0,
  });
}
