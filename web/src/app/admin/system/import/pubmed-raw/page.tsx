import { createAdminClient } from "@/lib/supabase/admin";
import PubmedRawPage from "./PubmedRawPage";

export default async function Page() {
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
    categoryDiffsRes,
    nullCategoryRes,
  ] = await Promise.all([
    admin.from("articles").select("id", { count: "exact", head: true }),
    admin.from("articles").select("id", { count: "exact", head: true }).not("pubmed_raw_latest_at", "is", null),
    a.from("article_pubmed_raw").select("id", { count: "exact", head: true }),
    a.from("article_pubmed_diffs").select("id", { count: "exact", head: true }).eq("resolution", "pending"),
    a.from("article_pubmed_diffs").select("resolution").neq("resolution", "pending"),
    a.from("article_pubmed_diffs").select("field").eq("resolution", "pending"),
    a.from("article_pubmed_diffs").select("category").eq("resolution", "pending"),
    a.from("article_pubmed_diffs").select("id", { count: "exact", head: true })
      .eq("resolution", "pending").is("category", null),
  ]);

  const totalArticles = totalRes.count ?? 0;
  const hasRaw        = hasRawRes.count ?? 0;
  const missingRaw    = totalArticles - hasRaw;
  const rawRows       = rawRowsRes.count ?? 0;
  const pendingDiffs  = pendingDiffsRes.count ?? 0;

  const resolvedMap: Record<string, number> = {};
  for (const row of (resolvedDiffsRes.data ?? []) as { resolution: string }[]) {
    resolvedMap[row.resolution] = (resolvedMap[row.resolution] ?? 0) + 1;
  }

  const fieldMap: Record<string, number> = {};
  for (const row of (fieldDiffsRes.data ?? []) as { field: string }[]) {
    fieldMap[row.field] = (fieldMap[row.field] ?? 0) + 1;
  }

  const categoryMap: Record<string, number> = {};
  for (const row of (categoryDiffsRes.data ?? []) as { category: string | null }[]) {
    const key = row.category ?? "__null__";
    categoryMap[key] = (categoryMap[key] ?? 0) + 1;
  }

  return (
    <PubmedRawPage
      initialStats={{
        totalArticles,
        hasRaw,
        missingRaw,
        rawRows,
        pendingDiffs,
        resolvedDiffs: resolvedMap,
        pendingDiffsByField: fieldMap,
        pendingDiffsByCategory: categoryMap,
        nullCategoryCount: nullCategoryRes.count ?? 0,
      }}
    />
  );
}
