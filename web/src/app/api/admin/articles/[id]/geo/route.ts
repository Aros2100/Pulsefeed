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
  const { country, state, city, institution, department } = body as {
    country?: string;
    state?: string;
    city?: string;
    institution?: string;
    department?: string;
  };

  if (!country?.trim()) {
    return NextResponse.json({ error: "Country is required" }, { status: 400 });
  }

  const region = getRegion(country);
  const continent = getContinent(country);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Fetch previous geo for event logging
  const { data: prevData } = await admin
    .from("articles")
    .select("geo_city, geo_country, geo_state, geo_region, geo_continent, geo_institution, geo_department")
    .eq("id", id)
    .single();
  const prevGeo: GeoSnapshot | null = prevData ?? null;

  const now = new Date().toISOString();
  const newGeoFields = {
    geo_country:           country.trim(),
    geo_state:             state?.trim() || null,
    geo_city:              city?.trim() || null,
    geo_institution:       institution?.trim() || null,
    geo_department:        department?.trim() || null,
    geo_region:            region,
    geo_continent:         continent,
    geo_source:            "human",
    geo_defined_at:        now,
    geo_parser_confidence: null,
  };

  const { error } = await admin
    .from("articles")
    .update(newGeoFields)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logGeoUpdatedEvent(id, "human", prevGeo, {
    geo_country:    newGeoFields.geo_country,
    geo_state:      newGeoFields.geo_state,
    geo_city:       newGeoFields.geo_city,
    geo_institution: newGeoFields.geo_institution,
    geo_department: newGeoFields.geo_department,
    geo_region:     newGeoFields.geo_region,
    geo_continent:  newGeoFields.geo_continent,
  }, null);

  return NextResponse.json({ ok: true, region, continent });
}
