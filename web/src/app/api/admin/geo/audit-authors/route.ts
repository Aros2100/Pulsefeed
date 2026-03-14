import { NextResponse, NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

const INST_KEYWORDS = [
  "hospital", "university", "institute", "medical", "clinic",
  "school", "college", "center", "centre", "department", "health",
];

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const url = request.nextUrl;
  const priority = parseInt(url.searchParams.get("priority") ?? "1", 10);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const limit = parseInt(url.searchParams.get("limit") ?? "25", 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const SELECT = "id, display_name, affiliations, city, country, hospital, department, state, article_count";

  let authors: Record<string, unknown>[] = [];
  let total = 0;

  if (priority === 1) {
    // Institution keywords in city field
    const instFilter = INST_KEYWORDS.map((kw) => `city.ilike.%${kw}%`).join(",");

    const [dataRes, countRes] = await Promise.all([
      admin
        .from("authors")
        .select(SELECT)
        .not("affiliations", "is", null)
        .neq("affiliations", "{}")
        .or(instFilter)
        .order("article_count", { ascending: false })
        .range(offset, offset + limit - 1),
      admin
        .from("authors")
        .select("id", { count: "exact", head: true })
        .not("affiliations", "is", null)
        .neq("affiliations", "{}")
        .or(instFilter),
    ]);

    authors = dataRes.data ?? [];
    total = countRes.count ?? 0;
  } else if (priority === 2) {
    // City not in GeoNames — use existing RPC, paginate client-side style
    const { data } = await admin.rpc("get_authors_city_not_in_geonames", { p_limit: 200 });
    const all = (data ?? []) as Record<string, unknown>[];
    total = all.length;
    authors = all.slice(offset, offset + limit);
  } else if (priority === 3) {
    // Country is null despite having affiliations
    const [dataRes, countRes] = await Promise.all([
      admin
        .from("authors")
        .select(SELECT)
        .not("affiliations", "is", null)
        .neq("affiliations", "{}")
        .is("country", null)
        .order("article_count", { ascending: false })
        .range(offset, offset + limit - 1),
      admin
        .from("authors")
        .select("id", { count: "exact", head: true })
        .not("affiliations", "is", null)
        .neq("affiliations", "{}")
        .is("country", null),
    ]);

    authors = dataRes.data ?? [];
    total = countRes.count ?? 0;
  } else {
    // Priority 4: all with affiliations
    const [dataRes, countRes] = await Promise.all([
      admin
        .from("authors")
        .select(SELECT)
        .not("affiliations", "is", null)
        .neq("affiliations", "{}")
        .order("article_count", { ascending: false })
        .range(offset, offset + limit - 1),
      admin
        .from("authors")
        .select("id", { count: "exact", head: true })
        .not("affiliations", "is", null)
        .neq("affiliations", "{}")
    ]);

    authors = dataRes.data ?? [];
    total = countRes.count ?? 0;
  }

  // cityInGeonames flag
  if (priority === 2) {
    // P2 results are already known to NOT be in geonames
    authors = authors.map((a) => ({ ...a, cityInGeonames: false }));
  } else {
    const cities = [...new Set(authors.map((a) => a.city as string | null).filter(Boolean))] as string[];
    let geoSet = new Set<string>();
    if (cities.length > 0) {
      const { data: geoCities } = await admin
        .from("geo_cities")
        .select("name")
        .in("name", cities);
      geoSet = new Set((geoCities ?? []).map((c: { name: string }) => c.name));
    }
    authors = authors.map((a) => ({
      ...a,
      cityInGeonames: a.city ? geoSet.has(a.city as string) : false,
    }));
  }

  return NextResponse.json({ authors, total });
}
