import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SearchClient from "./SearchClient";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; specialties?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: articles }] = await Promise.all([
    supabase.from("users").select("specialty_slugs").eq("id", user.id).single(),
    supabase
      .from("articles")
      .select("id, title, journal_abbr, published_date, authors, publication_types, news_value, clinical_relevance, enriched_at, imported_at, specialty_tags")
      .eq("status", "approved")
      .order("imported_at", { ascending: false })
      .limit(500),
  ]);

  const userSpecialties: string[] = profile?.specialty_slugs ?? [];

  // Derive distinct specialty tags from all loaded articles (equivalent to SELECT DISTINCT unnest)
  const specialtyTags = [...new Set(
    (articles ?? []).flatMap((a) => (a.specialty_tags as string[] | null) ?? [])
  )].sort((a, b) => a.localeCompare(b));

  const params = await searchParams;
  const initialSpecialties = params.specialties
    ? params.specialties.split(",").filter(Boolean)
    : userSpecialties;

  return (
    <div style={{ background: "#f5f7fa", minHeight: "100vh" }}>
      <SearchClient
        articles={articles ?? []}
        specialtyTags={specialtyTags}
        initialQuery={params.q ?? ""}
        initialSpecialties={initialSpecialties}
      />
    </div>
  );
}
