import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = admin as any;

  const [
    totalRes,
    hasRawRes,
    rawRowsRes,
    pendingDiffsRes,
    resolvedDiffsRes,
    fieldDiffsRes,
  ] = await Promise.all([
    admin.from("articles").select("id", { count: "exact", head: true }),
    admin.from("articles").select("id", { count: "exact", head: true }).not("pubmed_raw_latest_at", "is", null),
    a.from("article_pubmed_raw").select("id", { count: "exact", head: true }),
    a.from("article_pubmed_diffs").select("id", { count: "exact", head: true }).eq("resolution", "pending"),
    a.from("article_pubmed_diffs").select("resolution").neq("resolution", "pending"),
    a.from("article_pubmed_diffs").select("field").eq("resolution", "pending"),
  ]);

  const totalArticles   = totalRes.count ?? 0;
  const hasRaw          = hasRawRes.count ?? 0;
  const missingRaw      = totalArticles - hasRaw;
  const rawRows         = rawRowsRes.count ?? 0;
  const pendingDiffs    = pendingDiffsRes.count ?? 0;

  // Group resolved diffs by resolution
  const resolvedMap: Record<string, number> = {};
  for (const row of (resolvedDiffsRes.data ?? []) as { resolution: string }[]) {
    resolvedMap[row.resolution] = (resolvedMap[row.resolution] ?? 0) + 1;
  }

  // Distribution of pending diffs by field
  const fieldMap: Record<string, number> = {};
  for (const row of (fieldDiffsRes.data ?? []) as { field: string }[]) {
    fieldMap[row.field] = (fieldMap[row.field] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    totalArticles,
    hasRaw,
    missingRaw,
    rawRows,
    pendingDiffs,
    resolvedDiffs: resolvedMap,
    pendingDiffsByField: fieldMap,
  });
}
