import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Header from "@/components/Header";
import GeoExplorer from "./GeoExplorer";

export interface GeoRegion {
  region: string;
  count: number;
}

export interface GeoCountry {
  region: string;
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
  searchParams: Promise<{ region?: string; country?: string; city?: string }>;
}

export default async function GeoPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const { region, country, city } = params;

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Always fetch regions for breadcrumb context
  const regionsResult = await admin.rpc("get_geo_regions_week", { p_since: weekAgo }) as {
    data: GeoRegion[] | null;
  };
  const regions = (regionsResult.data ?? []) as GeoRegion[];

  let countries: GeoCountry[] = [];
  let cities: GeoCity[] = [];
  let articles: GeoArticle[] = [];

  if (region && !country && !city) {
    // Level 2: countries within a region
    const countriesResult = await admin.rpc("get_geo_countries_week", { p_since: weekAgo }) as {
      data: GeoCountry[] | null;
    };
    countries = ((countriesResult.data ?? []) as GeoCountry[]).filter(
      (c) => c.region === region
    );
  }

  if (country && !city) {
    // Level 3: cities within a country
    const citiesResult = await admin.rpc("get_geo_cities_week", {
      p_since: weekAgo,
      p_country: country,
    }) as { data: GeoCity[] | null };
    cities = (citiesResult.data ?? []) as GeoCity[];
  }

  if (city) {
    // Level 4: articles in a city
    const articlesResult = await admin.rpc("get_geo_articles_week", {
      p_since: weekAgo,
      p_city: city,
    }) as { data: GeoArticle[] | null };
    articles = (articlesResult.data ?? []) as GeoArticle[];
  }

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <Header />
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>
        <GeoExplorer
          region={region}
          country={country}
          city={city}
          regions={regions}
          countries={countries}
          cities={cities}
          articles={articles}
        />
      </div>
    </div>
  );
}
