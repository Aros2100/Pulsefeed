import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRegion, getContinent } from "@/lib/geo/country-map";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { rowId } = await params;
  const body = await req.json();
  const {
    country, state, city,
    institution, institution2, institution3,
    department, department2, department3,
  } = body as {
    country?: string;
    state?: string;
    city?: string;
    institution?: string;
    institution2?: string;
    institution3?: string;
    department?: string;
    department2?: string;
    department3?: string;
  };

  const region    = country?.trim() ? getRegion(country.trim())    : null;
  const continent = country?.trim() ? getContinent(country.trim()) : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: prev } = await admin
    .from("article_geo_addresses")
    .select("state")
    .eq("id", rowId)
    .maybeSingle();

  const prevState = prev?.state ?? null;
  const newState  = state?.trim() || null;
  const stateChanged = newState !== prevState;

  const { error } = await admin
    .from("article_geo_addresses")
    .update({
      country:            country?.trim() || null,
      state:              newState,
      city:               city?.trim() || null,
      region,
      continent,
      institution:        institution?.trim()  || null,
      institution2:       institution2?.trim() || null,
      institution3:       institution3?.trim() || null,
      department:         department?.trim()   || null,
      department2:        department2?.trim()  || null,
      department3:        department3?.trim()  || null,
      state_source:       stateChanged && newState ? "manual" : undefined,
      updated_at:         new Date().toISOString(),
    })
    .eq("id", rowId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, region, continent });
}
