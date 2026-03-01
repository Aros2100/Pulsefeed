import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SPECIALTIES } from "@/lib/auth/specialties";
import Header from "@/components/Header";
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
      .select("id, title, journal_abbr, published_date, authors, publication_types, news_value, clinical_relevance, enriched_at, imported_at, specialty_tags, verified")
      .order("imported_at", { ascending: false })
      .limit(500),
  ]);

  const userSpecialties: string[] = profile?.specialty_slugs ?? [];

  // Derive distinct specialty tags from all loaded articles (equivalent to SELECT DISTINCT unnest)
  const specialtyTags = [...new Set(
    (articles ?? []).flatMap((a) => (a.specialty_tags as string[] | null) ?? [])
  )].sort((a, b) => {
    // Sort: known SPECIALTIES order first, then alphabetical
    const ai = SPECIALTIES.findIndex((s) => s.slug === a);
    const bi = SPECIALTIES.findIndex((s) => s.slug === b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  const params = await searchParams;
  const initialSpecialties = params.specialties
    ? params.specialties.split(",").filter(Boolean)
    : userSpecialties;

  return (
    <div style={{ background: "#f5f7fa", minHeight: "100vh" }}>
      <Header />
      <SearchClient
        articles={articles ?? []}
        specialtyTags={specialtyTags}
        initialQuery={params.q ?? ""}
        initialSpecialties={initialSpecialties}
      />
    </div>
  );
}
