import { createAdminClient } from "@/lib/supabase/admin";
import { lookupState } from "@/lib/geo/state-map";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function resolveState(admin: AdminClient, city: string | null, country: string | null): Promise<string | null> {
  if (!city || !country) return null;
  // 1. Check cache
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cached } = await (admin as any)
    .from("geo_city_state_cache")
    .select("state")
    .eq("city", city.toLowerCase())
    .eq("country", country)
    .maybeSingle();
  if (cached) return (cached.state as string | null) ?? null;
  // 2. Fallback to hardcoded map
  const mapState = lookupState(city, country);
  if (mapState) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("geo_city_state_cache").upsert(
      { city: city.toLowerCase(), country, state: mapState },
      { onConflict: "city,country" }
    );
  }
  return mapState;
}
