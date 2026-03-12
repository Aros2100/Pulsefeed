import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRegion, getContinent } from "@/lib/geo/continent-map";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json();
  const { country, state, city, institution } = body as {
    country?: string;
    state?: string;
    city?: string;
    institution?: string;
  };

  const region = country ? getRegion(country) : null;
  const continent = region ? getContinent(region) : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error } = await admin
    .from("articles")
    .update({
      geo_country: country || null,
      geo_state: state || null,
      geo_city: city || null,
      geo_institution: institution || null,
      geo_region: region,
      geo_continent: continent,
      geo_country_certain: true,
      geo_state_certain: true,
      geo_city_certain: true,
      geo_institution_certain: true,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, region, continent });
}
