import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

export interface GeoState {
  state: string;
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
    state?: string;
    city?: string;
  }>;
}

export default async function GeoPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const { continent, region, country, state, city } = params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  let continents: GeoContinent[] = [];
  let regions: GeoRegion[] = [];
  let countries: GeoCountry[] = [];
  let states: GeoState[] = [];
  let cities: GeoCity[] = [];
  let articles: GeoArticle[] = [];

  if (!continent && !region && !country && !state && !city) {
    // Level 1: continents
    const res = await admin.rpc("get_geo_continents");
    continents = (res.data ?? []) as GeoContinent[];
  } else if (continent && !region && !country && !state && !city) {
    // Level 2: regions within continent
    const res = await admin.rpc("get_geo_regions", { p_continent: continent });
    regions = (res.data ?? []) as GeoRegion[];
  } else if (continent && region && !country && !state && !city) {
    // Level 3: countries within region
    const res = await admin.rpc("get_geo_countries", { p_region: region });
    countries = (res.data ?? []) as GeoCountry[];
  } else if (continent && region && country && !state && !city) {
    // Level 4: states within country (if any), otherwise cities
    const stateRes = await admin.rpc("get_geo_states", { p_country: country });
    const stateRows = (stateRes.data ?? []) as GeoState[];
    if (stateRows.length > 0) {
      states = stateRows;
    } else {
      const cityRes = await admin.rpc("get_geo_cities", { p_country: country, p_state: null });
      cities = (cityRes.data ?? []) as GeoCity[];
    }
  } else if (continent && region && country && state && !city) {
    // Level 5: cities within state
    const res = await admin.rpc("get_geo_cities", { p_country: country, p_state: state });
    cities = (res.data ?? []) as GeoCity[];
  } else if (city) {
    // Level 6: articles in city
    const res = await admin.rpc("get_geo_articles", { p_city: city });
    articles = (res.data ?? []) as GeoArticle[];
  }

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>
        <GeoExplorer
          continent={continent}
          region={region}
          country={country}
          state={state}
          city={city}
          continents={continents}
          regions={regions}
          countries={countries}
          states={states}
          cities={cities}
          articles={articles}
        />
      </div>
    </div>
  );
}
