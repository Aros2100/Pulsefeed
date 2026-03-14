import { NextResponse, type NextRequest } from "next/server";
import { REGION_MAP } from "@/lib/geo/continent-map";

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Build inverted map: region → titleCase(countries)
const regionToCountries: Record<string, string[]> = {};
for (const [country, region] of Object.entries(REGION_MAP)) {
  if (!regionToCountries[region]) regionToCountries[region] = [];
  regionToCountries[region].push(titleCase(country));
}
for (const arr of Object.values(regionToCountries)) {
  arr.sort((a, b) => a.localeCompare(b));
}

export async function GET(request: NextRequest) {
  const continent = request.nextUrl.searchParams.get("continent");
  if (!continent) {
    return NextResponse.json({ error: "continent required" }, { status: 400 });
  }

  const countries = regionToCountries[continent] ?? [];
  return NextResponse.json({ countries });
}
