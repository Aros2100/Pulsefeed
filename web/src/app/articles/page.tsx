import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SPECIALTIES } from "@/lib/auth/specialties";
import Header from "@/components/Header";
import ArticleListClient from "./ArticleListClient";

function periodSince(period: string): string {
  const now = Date.now();
  switch (period) {
    case "month": return new Date(now - 30  * 24 * 60 * 60 * 1000).toISOString();
    case "year":  return new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();
    default:      return new Date(now - 7   * 24 * 60 * 60 * 1000).toISOString();
  }
}

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; subspecialty?: string }>;
}) {
  const { period, subspecialty } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users").select("specialty_slugs").eq("id", user.id).single();

  const specialtySlugs: string[] = profile?.specialty_slugs ?? [];

  let articlesQuery = supabase
    .from("articles")
    .select("id, title, journal_abbr, published_date, authors, publication_types, news_value, clinical_relevance, enriched_at, imported_at")
    .eq("status", "approved")
    .order("imported_at", { ascending: false })
    .limit(200);

  if (specialtySlugs.length > 0) {
    articlesQuery = articlesQuery.contains("specialty_tags", specialtySlugs);
  }

  if (period) {
    articlesQuery = articlesQuery.gte("imported_at", periodSince(period));
  }

  if (subspecialty) {
    articlesQuery = articlesQuery.contains("subspecialty_ai", [subspecialty]);
  }

  const [{ data: articles }, { data: savedRows }, { data: projectRows }] = await Promise.all([
    articlesQuery,
    supabase.from("saved_articles").select("article_id, project_id").eq("user_id", user.id),
    supabase.from("projects").select("id, name").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);

  const specialtyLabel = (profile?.specialty_slugs ?? [])
    .map((s) => SPECIALTIES.find((sp) => sp.slug === s)?.label)
    .filter(Boolean)
    .join(", ") || "All specialties";

  // Build a map of articleId → projectId for saved state
  const savedMap: Record<string, string | null> = {};
  for (const row of savedRows ?? []) {
    if (row.article_id) savedMap[row.article_id] = row.project_id ?? null;
  }

  return (
    <div style={{ background: "#f5f7fa", minHeight: "100vh" }}>
      <Header />
      <ArticleListClient
        articles={articles ?? []}
        specialtyLabel={specialtyLabel}
        savedMap={savedMap}
        projects={(projectRows ?? []) as { id: string; name: string }[]}
        activePeriod={period ?? null}
        activeSubspecialty={subspecialty ?? null}
      />
    </div>
  );
}
