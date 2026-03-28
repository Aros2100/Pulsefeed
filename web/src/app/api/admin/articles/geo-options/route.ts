import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const field     = searchParams.get("field") ?? "";
  const continent = searchParams.get("continent") || null;
  const region    = searchParams.get("region")    || null;
  const country   = searchParams.get("country")   || null;
  const state     = searchParams.get("state")     || null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data, error } = await admin.rpc("get_geo_options_filtered", {
    p_field:     field || null,
    p_continent: continent,
    p_region:    region,
    p_country:   country,
    p_state:     state,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, options: (data as string[]) ?? [] });
}
