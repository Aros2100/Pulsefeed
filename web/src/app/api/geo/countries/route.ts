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
  const region = request.nextUrl.searchParams.get("region");
  if (!region) {
    return NextResponse.json({ error: "region required" }, { status: 400 });
  }

  const countries = regionToCountries[region] ?? [];
  return NextResponse.json({ countries });
}
