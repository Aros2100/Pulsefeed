import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const [totalRes, hasIFRes, noIssnRes, fetchedNullIFRes, latestRes] = await Promise.all([
    // Total articles
    admin.from("articles").select("id", { count: "exact", head: true }),
    // Has impact factor value
    admin.from("articles").select("id", { count: "exact", head: true })
      .not("impact_factor", "is", null),
    // No ISSN at all — cannot be looked up
    admin.from("articles").select("id", { count: "exact", head: true })
      .is("issn_electronic", null)
      .is("issn_print", null),
    // Fetched but IF is null (journal not in OpenAlex or no data)
    admin.from("articles").select("id", { count: "exact", head: true })
      .not("impact_factor_fetched_at", "is", null)
      .is("impact_factor", null),
    // Latest fetch timestamp
    admin.from("articles").select("impact_factor_fetched_at")
      .not("impact_factor_fetched_at", "is", null)
      .order("impact_factor_fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const total  = totalRes.count       ?? 0;
  const hasIF  = hasIFRes.count       ?? 0;
  const noIssn = noIssnRes.count      ?? 0;
  const noData = fetchedNullIFRes.count ?? 0;
  // pending = everything else: has ISSN, not yet fetched, no IF
  const pending = Math.max(0, total - hasIF - noData - noIssn);
  const pct     = total > 0 ? Math.round((hasIF / total) * 100) : 0;
  const latestFetchedAt = (latestRes.data as { impact_factor_fetched_at: string } | null)?.impact_factor_fetched_at ?? null;

  return NextResponse.json({ hasIF, noData, noIssn, pending, total, pct, latestFetchedAt });
}
