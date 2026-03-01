import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SPECIALTIES } from "@/lib/auth/specialties";
import Header from "@/components/Header";
import ArticleListClient from "./ArticleListClient";

export default async function ArticlesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users").select("specialty_slugs").eq("id", user.id).single();

  const specialtySlugs: string[] = profile?.specialty_slugs ?? [];

  let articlesQuery = supabase
    .from("articles")
    .select("id, title, journal_abbr, published_date, authors, publication_types, news_value, clinical_relevance, enriched_at, imported_at")
    .eq("verified", true)
    .order("imported_at", { ascending: false })
    .limit(200);

  if (specialtySlugs.length > 0) {
    articlesQuery = articlesQuery.contains("specialty_tags", specialtySlugs);
  }

  const { data: articles } = await articlesQuery;

  const specialtyLabel = (profile?.specialty_slugs ?? [])
    .map((s) => SPECIALTIES.find((sp) => sp.slug === s)?.label)
    .filter(Boolean)
    .join(", ") || "All specialties";

  return (
    <div style={{ background: "#f5f7fa", minHeight: "100vh" }}>
      <Header />
      <ArticleListClient
        articles={articles ?? []}
        specialtyLabel={specialtyLabel}
      />
    </div>
  );
}
