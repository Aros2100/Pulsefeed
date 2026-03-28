import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRegion, getContinent } from "@/lib/geo/country-map";
import { logGeoUpdatedEvent, type GeoSnapshot } from "@/lib/article-events";

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
  const continent = country ? getContinent(country) : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Fetch previous geo for event logging
  const { data: prevData } = await admin
    .from("articles")
    .select("geo_city, geo_country, geo_state, geo_region, geo_continent, geo_institution, geo_department")
    .eq("id", id)
    .single();
  const prevGeo: GeoSnapshot | null = prevData ?? null;

  const { error } = await admin
    .from("articles")
    .update({
      geo_country: country || null,
      geo_state: state || null,
      geo_city: city || null,
      geo_institution: institution || null,
      geo_region: region,
      geo_continent: continent,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logGeoUpdatedEvent(id, "manual", prevGeo, {
    geo_country: country || null,
    geo_state: state || null,
    geo_city: city || null,
    geo_institution: institution || null,
    geo_region: region,
    geo_continent: continent,
  });

  return NextResponse.json({ ok: true, region, continent });
}
