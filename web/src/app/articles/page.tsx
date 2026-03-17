import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SPECIALTIES } from "@/lib/auth/specialties";
import { SUBSPECIALTY_OPTIONS } from "@/lib/lab/classification-options";
import Header from "@/components/Header";
import ArticleListClient from "./ArticleListClient";

const PAGE_SIZE = 25;

function periodSince(period: string): string {
  const now = new Date();
  switch (period) {
    case "month":
    case "måned": return new Date(now.getTime() - 30  * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    case "year":
    case "år":    return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    default:      return new Date(now.getTime() - 7   * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
}

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; subspecialty?: string; region?: string; country?: string; city?: string; institution?: string; page?: string }>;
}) {
  const { period, subspecialty, region, country, city, institution, page } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users").select("specialty_slugs").eq("id", user.id).single();

  const specialtySlugs: string[] = profile?.specialty_slugs ?? [];

  const currentPage = Math.max(1, parseInt(page ?? "1", 10));
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let articlesQuery = (supabase as any)
    .from("articles")
    .select("id, title, journal_abbr, published_date, indexed_date, authors, publication_types, news_value, clinical_relevance, enriched_at, imported_at", { count: "exact" })
    .eq("status", "approved")
    .order("indexed_date", { ascending: false })
    .range(from, to);

  if (specialtySlugs.length > 0) {
    articlesQuery = articlesQuery.contains("specialty_tags", specialtySlugs);
  }

  if (!period || (period !== "alle" && period !== "all")) {
    articlesQuery = articlesQuery.gte("indexed_date", periodSince(period ?? "uge"));
  }

  if (subspecialty) articlesQuery = articlesQuery.contains("subspecialty_ai",      [subspecialty]);
  if (region)       articlesQuery = articlesQuery.contains("article_regions",      [region]);
  if (country)      articlesQuery = articlesQuery.contains("article_countries",    [country]);
  if (city)         articlesQuery = articlesQuery.contains("article_cities",       [city]);
  if (institution)  articlesQuery = articlesQuery.contains("article_institutions", [institution]);

  const [
    { data: articles, count: totalCount },
    { data: savedRows },
    { data: projectRows },
    { data: locationRows },
  ] = await Promise.all([
    articlesQuery,
    supabase.from("saved_articles").select("article_id, project_id").eq("user_id", user.id),
    supabase.from("projects").select("id, name").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("articles")
      .select("article_regions, article_countries, article_cities, article_institutions")
      .eq("status", "approved")
      .not("article_regions", "is", null),
  ]);

  const totalPages = Math.ceil((totalCount ?? 0) / PAGE_SIZE);

  const specialtyLabel = (profile?.specialty_slugs ?? [])
    .map((s) => SPECIALTIES.find((sp) => sp.slug === s)?.label)
    .filter(Boolean)
    .join(", ") || "All specialties";

  const savedMap: Record<string, string | null> = {};
  for (const row of savedRows ?? []) {
    if (row.article_id) savedMap[row.article_id] = row.project_id ?? null;
  }

  // Build cascading geo maps from location rows
  type LocationRow = {
    article_regions:      string[] | null;
    article_countries:    string[] | null;
    article_cities:       string[] | null;
    article_institutions: string[] | null;
  };
  const locationData = (locationRows ?? []) as unknown as LocationRow[];

  const allRegions           = new Set<string>();
  const regionToCountries:   Record<string, Set<string>> = {};
  const countryToCities:     Record<string, Set<string>> = {};
  const cityToInstitutions:  Record<string, Set<string>> = {};

  for (const row of locationData) {
    for (const reg of row.article_regions ?? []) {
      allRegions.add(reg);
      if (!regionToCountries[reg]) regionToCountries[reg] = new Set();
      for (const c of row.article_countries ?? []) {
        regionToCountries[reg].add(c);
        if (!countryToCities[c]) countryToCities[c] = new Set();
        for (const ci of row.article_cities ?? []) {
          countryToCities[c].add(ci);
          if (!cityToInstitutions[ci]) cityToInstitutions[ci] = new Set();
          for (const inst of row.article_institutions ?? []) {
            cityToInstitutions[ci].add(inst);
          }
        }
      }
    }
  }

  const geoMap = {
    regions: [...allRegions].sort(),
    regionToCountries: Object.fromEntries(
      Object.entries(regionToCountries).map(([k, v]) => [k, [...v].sort()])
    ),
    countryToCities: Object.fromEntries(
      Object.entries(countryToCities).map(([k, v]) => [k, [...v].sort()])
    ),
    cityToInstitutions: Object.fromEntries(
      Object.entries(cityToInstitutions).map(([k, v]) => [k, [...v].sort()])
    ),
  };

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
        activeRegion={region ?? null}
        activeCountry={country ?? null}
        activeCity={city ?? null}
        activeInstitution={institution ?? null}
        subspecialtyOptions={[...SUBSPECIALTY_OPTIONS]}
        geoMap={geoMap}
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={totalCount ?? 0}
      />
    </div>
  );
}
