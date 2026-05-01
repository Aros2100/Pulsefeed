import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { getSubspecialties } from "@/lib/lab/classification-options";
import { REGION_MAP, getContinent } from "@/lib/geo/continent-map";
import ArticleListClient from "./ArticleListClient";

const PAGE_SIZE = 25;

function titleCase(s: string): string {
  return s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

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
  searchParams: Promise<{
    period?: string; subspecialty?: string;
    continent?: string; region?: string; country?: string; city?: string;
    hospital?: string; geo_search?: string;
    page?: string;
    "mesh[]"?: string | string[];
  }>;
}) {
  const { period, subspecialty, continent, region, country, city, hospital, geo_search, page, "mesh[]": mesh } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users").select("specialty_slugs, author_id").eq("id", user.id).single();

  const specialtySlugs: string[] = profile?.specialty_slugs ?? [];
  const subspecialtiesList = await getSubspecialties(ACTIVE_SPECIALTY);

  // Fetch user's hospital for pre-filling the geo filter
  let userHospital: string | null = null;
  if (profile?.author_id) {
    const { data: authorRow } = await supabase
      .from("authors").select("hospital").eq("id", profile.author_id).single();
    userHospital = (authorRow as { hospital?: string | null } | null)?.hospital ?? null;
  }

  const currentPage = Math.max(1, parseInt(page ?? "1", 10));
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let articlesQuery = (supabase as any)
    .from("articles")
    .select("id, title, journal_abbr, published_date, indexed_date, authors, publication_types, enriched_at, imported_at", { count: "exact" })
    .eq("status", "approved")
    .order("indexed_date", { ascending: false })
    .range(from, to);

  if (specialtySlugs.length > 0) {
    articlesQuery = articlesQuery.contains("specialty_tags", specialtySlugs);
  }

  if (!period || (period !== "alle" && period !== "all")) {
    articlesQuery = articlesQuery.gte("indexed_date", periodSince(period ?? "uge"));
  }

  if (subspecialty) articlesQuery = articlesQuery.contains("subspecialty_ai", [subspecialty]);

  const meshTerms = mesh
    ? (Array.isArray(mesh) ? mesh : [mesh])
    : [];

  if (meshTerms.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: meshIdRows } = await (supabase as any).rpc(
      "get_article_ids_for_mesh_terms",
      { p_mesh_terms: meshTerms },
    );
    const matchingIds = (meshIdRows ?? []).map((r: { id: string }) => r.id) as string[];
    articlesQuery = articlesQuery.in(
      "id",
      matchingIds.length > 0 ? matchingIds : ["00000000-0000-0000-0000-000000000000"],
    );
  }

  // Geo filters resolved via article_geo_addresses
  if (continent || region || hospital) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let geoQ = (supabase as any).from("article_geo_addresses").select("article_id");
    if (continent) {
      const regions = [...new Set(
        Object.entries(REGION_MAP)
          .filter(([, r]) => getContinent(r) === continent)
          .map(([, r]) => r),
      )];
      if (regions.length > 0) geoQ = geoQ.in("region", regions);
    }
    if (region)   geoQ = geoQ.eq("region",      region);
    if (hospital) geoQ = geoQ.eq("institution", hospital);
    const { data: geoRows } = await geoQ;
    const geoIds = [...new Set(((geoRows ?? []) as Array<{ article_id: string }>).map((r) => r.article_id))];
    articlesQuery = articlesQuery.in("id", geoIds.length > 0 ? geoIds : ["00000000-0000-0000-0000-000000000000"]);
  }
  if (country)    articlesQuery = articlesQuery.contains("article_countries", [country]);
  if (city)       articlesQuery = articlesQuery.contains("article_cities",    [city]);
  if (geo_search) articlesQuery = articlesQuery.or(
    `article_countries.cs.{${geo_search}},article_cities.cs.{${geo_search}}`,
  );

  const [
    { data: articles, count: totalCount },
    { data: savedRows },
    { data: projectRows },
    { data: locationRows },
  ] = await Promise.all([
    articlesQuery,
    supabase.from("saved_articles").select("article_id, project_id").eq("user_id", user.id),
    supabase.from("projects").select("id, name").eq("user_id", user.id).order("created_at", { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("article_geo_addresses")
      .select("article_id, region, country, city, institution")
      .not("region", "is", null),
  ]);

  const totalPages = Math.ceil((totalCount ?? 0) / PAGE_SIZE);

  const specialtyLabel = (profile?.specialty_slugs ?? [])
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " "))
    .join(", ") || "All specialties";

  const savedMap: Record<string, string | null> = {};
  for (const row of savedRows ?? []) {
    if (row.article_id) savedMap[row.article_id] = row.project_id ?? null;
  }

  // Build cascading geo maps from article_geo_addresses rows
  type LocationRow = {
    region:      string | null;
    country:     string | null;
    city:        string | null;
    institution: string | null;
  };
  const locationData = (locationRows ?? []) as unknown as LocationRow[];

  const allRegions           = new Set<string>();
  const regionToCountries:   Record<string, Set<string>> = {};
  const countryToCities:     Record<string, Set<string>> = {};
  const cityToInstitutions:  Record<string, Set<string>> = {};

  for (const row of locationData) {
    const reg = row.region;
    if (!reg) continue;
    allRegions.add(reg);
    if (!regionToCountries[reg]) regionToCountries[reg] = new Set();
    const cty = row.country;
    if (cty) {
      regionToCountries[reg].add(cty);
      if (!countryToCities[cty]) countryToCities[cty] = new Set();
      const ci = row.city;
      if (ci) {
        countryToCities[cty].add(ci);
        if (!cityToInstitutions[ci]) cityToInstitutions[ci] = new Set();
        if (row.institution) cityToInstitutions[ci].add(row.institution);
      }
    }
  }

  // Build title-case country lookup for geoMap
  void titleCase; // used above for continent filtering

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
      <ArticleListClient
        articles={articles ?? []}
        specialtyLabel={specialtyLabel}
        savedMap={savedMap}
        projects={(projectRows ?? []) as { id: string; name: string }[]}
        activePeriod={period ?? null}
        activeSubspecialty={subspecialty ?? null}
        subspecialtyOptions={subspecialtiesList}
        geoMap={geoMap}
        userHospital={userHospital}
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={totalCount ?? 0}
        activeMeshTerms={meshTerms}
      />
    </div>
  );
}
