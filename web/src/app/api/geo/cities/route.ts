import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get("country");
  if (!country) {
    return NextResponse.json({ error: "country required" }, { status: 400 });
  }
  const state = request.nextUrl.searchParams.get("state");

  const supabase = await createClient();

  let query = (supabase as any)
    .from("geo_cities")
    .select("name")
    .eq("country", country)
    .order("population", { ascending: false })
    .limit(500);

  if (state) {
    query = query.eq("state", state);
  }

  const { data } = await query;

  // Deduplicate city names
  const unique = [...new Set((data ?? []).map((r: { name: string }) => r.name))];
  return NextResponse.json({ cities: unique });
}
