import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const [withRes, withoutRes, latestRes] = await Promise.all([
    admin.from("articles").select("id", { count: "exact", head: true }).not("citation_count", "is", null),
    admin.from("articles").select("id", { count: "exact", head: true }).is("citation_count", null),
    admin.from("articles").select("citations_fetched_at").not("citations_fetched_at", "is", null).order("citations_fetched_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const withCitations = withRes.count ?? 0;
  const withoutCitations = withoutRes.count ?? 0;
  const total = withCitations + withoutCitations;
  const pct = total > 0 ? Math.round((withCitations / total) * 100) : 0;
  const latestFetchedAt = (latestRes.data as { citations_fetched_at: string } | null)?.citations_fetched_at ?? null;

  return NextResponse.json({ withCitations, withoutCitations, total, pct, latestFetchedAt });
}
