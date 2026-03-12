import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserGeo } from "@/lib/geo/user-geo";

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get("period") || "week";
  const subspecialty = req.nextUrl.searchParams.get("subspecialty") || null;

  // Auth: get current user's geo from profile
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let userGeo = getUserGeo("Denmark", "Copenhagen", null); // fallback

  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("country, city, hospital")
      .eq("id", user.id)
      .single();

    if (profile?.country) {
      userGeo = getUserGeo(profile.country, profile.city, profile.hospital);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const [kpiRes, geoRes] = await Promise.all([
    admin.rpc("get_kpi_overview", {
      p_period: period,
      p_subspecialty: subspecialty || null,
    }),
    admin.rpc("get_kpi_geo_hierarchy", {
      p_period: period,
      p_subspecialty: subspecialty || null,
      p_continent: userGeo?.continent ?? null,
      p_region: userGeo?.region ?? null,
      p_country: userGeo?.country ?? null,
      p_city: userGeo?.city ?? null,
    }),
  ]);

  if (kpiRes.error) {
    return NextResponse.json({ error: kpiRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ...kpiRes.data,
    geoHierarchy: geoRes.data ?? { all: 0, continent: 0, region: 0, country: 0, city: 0 },
    userGeo: userGeo ?? null,
  });
}
