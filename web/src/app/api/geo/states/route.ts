import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get("country");
  if (!country) {
    return NextResponse.json({ error: "country required" }, { status: 400 });
  }

  const supabase = await createClient();

  // Only return states if country has >= 50 cities (otherwise frontend hides dropdown)
  const { count } = await (supabase as any)
    .from("geo_cities")
    .select("geonameid", { count: "exact", head: true })
    .eq("country", country);

  if ((count ?? 0) < 50) {
    return NextResponse.json({ states: [] });
  }

  const { data } = await (supabase as any)
    .from("geo_cities")
    .select("state")
    .eq("country", country)
    .not("state", "is", null)
    .order("state");

  // Deduplicate
  const unique = [...new Set((data ?? []).map((r: { state: string }) => r.state))].sort();
  return NextResponse.json({ states: unique });
}
