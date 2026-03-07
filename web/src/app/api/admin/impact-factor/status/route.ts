import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const [withRes, withoutRes, latestRes] = await Promise.all([
    admin.from("articles").select("id", { count: "exact", head: true }).not("impact_factor", "is", null),
    admin.from("articles").select("id", { count: "exact", head: true }).is("impact_factor", null),
    admin.from("articles").select("impact_factor_fetched_at").not("impact_factor_fetched_at", "is", null).order("impact_factor_fetched_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const withIF    = withRes.count  ?? 0;
  const withoutIF = withoutRes.count ?? 0;
  const total     = withIF + withoutIF;
  const pct       = total > 0 ? Math.round((withIF / total) * 100) : 0;
  const latestFetchedAt = (latestRes.data as { impact_factor_fetched_at: string } | null)?.impact_factor_fetched_at ?? null;

  return NextResponse.json({ withIF, withoutIF, total, pct, latestFetchedAt });
}
