import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Header from "@/components/Header";
import GeoExplorer from "./GeoExplorer";

export interface GeoContinent {
  continent: string;
  count: number;
}

export interface GeoRegion {
  region: string;
  count: number;
}

export interface GeoCountry {
  country: string;
  count: number;
}

export interface GeoCity {
  city: string;
  count: number;
}

export interface GeoArticle {
  id: string;
  title: string;
  journal_abbr: string | null;
  published_date: string | null;
}

interface Props {
  searchParams: Promise<{
    continent?: string;
    region?: string;
    country?: string;
    city?: string;
  }>;
}

export default async function GeoPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const { continent, region, country, city } = params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Dynamic since-date: max(indexed_date) - 7 days
  const { data: maxRow } = await admin
    .from("articles")
    .select("indexed_date")
    .not("indexed_date", "is", null)
    .order("indexed_date", { ascending: false })
    .limit(1)
    .single();

  let since: string | null = null;
  if (maxRow?.indexed_date) {
    const maxDate = new Date(maxRow.indexed_date);
    maxDate.setDate(maxDate.getDate() - 7);
    since = maxDate.toISOString().slice(0, 10); // date only
  }

  let continents: GeoContinent[] = [];
  let regions: GeoRegion[] = [];
  let countries: GeoCountry[] = [];
  let cities: GeoCity[] = [];
  let articles: GeoArticle[] = [];

  if (!continent && !region && !country && !city) {
    // Level 1: continents
    const res = await admin.rpc("get_geo_continents", { p_since: since });
    continents = (res.data ?? []) as GeoContinent[];
  } else if (continent && !region && !country && !city) {
    // Level 2: regions within continent
    const res = await admin.rpc("get_geo_regions", { p_since: since, p_continent: continent });
    regions = (res.data ?? []) as GeoRegion[];
  } else if (continent && region && !country && !city) {
    // Level 3: countries within region
    const res = await admin.rpc("get_geo_countries", { p_since: since, p_region: region });
    countries = (res.data ?? []) as GeoCountry[];
  } else if (continent && region && country && !city) {
    // Level 4: cities within country
    const res = await admin.rpc("get_geo_cities", { p_since: since, p_country: country });
    cities = (res.data ?? []) as GeoCity[];
  } else if (city) {
    // Level 5: articles in city
    const res = await admin.rpc("get_geo_articles", { p_since: since, p_city: city });
    articles = (res.data ?? []) as GeoArticle[];
  }

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <Header />
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>
        <GeoExplorer
          continent={continent}
          region={region}
          country={country}
          city={city}
          continents={continents}
          regions={regions}
          countries={countries}
          cities={cities}
          articles={articles}
        />
      </div>
    </div>
  );
}
