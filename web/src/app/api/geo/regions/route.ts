import { NextResponse, type NextRequest } from "next/server";

const CONTINENT_TO_REGIONS: Record<string, string[]> = {
  Europe: ["Scandinavia", "Western Europe", "Southern Europe", "Eastern Europe"],
  Asia: ["East Asia", "Southeast Asia", "South Asia", "Russia & Central Asia", "Middle East"],
  Americas: ["North America", "Central America & Caribbean", "South America"],
  Africa: ["North Africa", "Sub-Saharan Africa"],
  Oceania: ["Oceania"],
};

export async function GET(request: NextRequest) {
  const continent = request.nextUrl.searchParams.get("continent");
  if (!continent) {
    return NextResponse.json({ error: "continent required" }, { status: 400 });
  }

  const regions = CONTINENT_TO_REGIONS[continent] ?? [];
  return NextResponse.json({ regions });
}
