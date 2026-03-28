import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

const ALLOWED_SORT = ["title", "journal_abbr", "published_date", "imported_at", "circle", "status", "verified", "evidence_score"] as const;

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);

  const page    = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit   = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") ?? "50", 10)));
  const circle  = searchParams.get("circle");
  const status  = searchParams.get("status");
  const subspecialty = searchParams.get("subspecialty");
  const verified        = searchParams.get("verified");
  const approvalMethod  = searchParams.get("approval_method");
  const hasAbstract     = searchParams.get("has_abstract");
  const dateFrom = searchParams.get("date_from");
  const dateTo   = searchParams.get("date_to");
  const meshTerm     = searchParams.get("mesh_term")?.trim() ?? "";
  const search       = searchParams.get("search")?.trim() ?? "";
  const geoCountry   = searchParams.get("geo_country")?.trim() ?? "";
  const geoContinent = searchParams.get("geo_continent")?.trim() ?? "";
  const geoRegion    = searchParams.get("geo_region")?.trim() ?? "";
  const geoState     = searchParams.get("geo_state")?.trim() ?? "";
  const geoCity      = searchParams.get("geo_city")?.trim() ?? "";
  const missingGeo   = searchParams.get("missing_geo") === "true";
  const noRegion     = searchParams.get("no_region")   === "true";
  const noCountry    = searchParams.get("no_country")  === "true";
  const noState      = searchParams.get("no_state")    === "true";
  const noCity       = searchParams.get("no_city")     === "true";
  const notParsed    = searchParams.get("not_parsed")   === "true";
  const suspectCity  = searchParams.get("suspect_city") === "true";
  const sortBy   = searchParams.get("sort_by") ?? "imported_at";
  const sortAsc  = searchParams.get("sort_dir") === "asc";

  const safeSortBy = (ALLOWED_SORT as readonly string[]).includes(sortBy) ? sortBy : "imported_at";
  const start = (page - 1) * limit;
  const end   = start + limit - 1;

  let query = admin
    .from("articles")
    .select("id, title, journal_abbr, published_date, imported_at, authors, status, circle, specialty_tags, verified, abstract, evidence_score", { count: "exact" });

  if (circle)    query = query.eq("circle", parseInt(circle, 10));
  if (status)    query = query.eq("status", status);
  if (subspecialty) query = query.contains("specialty_tags", [subspecialty]);
  if (verified === "true")  query = query.eq("verified", true);
  if (verified === "false") query = query.eq("verified", false);
  if (approvalMethod === "null")  query = query.is("approval_method", null);
  else if (approvalMethod)        query = query.eq("approval_method", approvalMethod);
  if (hasAbstract === "true")  query = query.not("abstract", "is", null);
  if (hasAbstract === "false") query = query.is("abstract", null);
  if (dateFrom) query = query.gte("imported_at", dateFrom);
  if (dateTo)   query = query.lte("imported_at", dateTo);
  if (meshTerm)     query = query.filter("mesh_terms::text", "ilike", `%${meshTerm}%`);
  if (search)       query = query.or(`title.ilike.%${search}%,journal_abbr.ilike.%${search}%`);
  if (geoCountry)   query = query.eq("geo_country", geoCountry);
  if (geoContinent) query = query.eq("geo_continent", geoContinent);
  if (geoRegion)    query = query.eq("geo_region", geoRegion);
  if (geoState)     query = query.eq("geo_state", geoState);
  if (geoCity)      query = query.eq("geo_city", geoCity);
  if (missingGeo)   query = query.is("geo_country", null).is("geo_city", null);
  if (noRegion)     query = query.is("geo_region",  null);
  if (noCountry)    query = query.is("geo_country", null);
  if (noState)      query = query.is("geo_state",   null).not("geo_country", "is", null);
  if (noCity)       query = query.is("geo_city",    null).not("geo_country", "is", null);
  if (notParsed)    query = query.is("location_parsed_at", null);

  // suspect_city: regex filters not supported by PostgREST .or() — use RPC to get IDs first
  if (suspectCity) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: idRows, error: rpcErr } = await (admin as any).rpc("get_suspect_city_article_ids");
    if (rpcErr) return NextResponse.json({ ok: false, error: rpcErr.message }, { status: 500 });
    const ids: string[] = (idRows ?? []).map((r: { id: string }) => r.id);
    if (ids.length === 0) return NextResponse.json({ ok: true, rows: [], total: 0 });
    query = query.in("id", ids);
  }

  const { data, error, count } = await query
    .order(safeSortBy, { ascending: sortAsc })
    .range(start, end);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: data ?? [], total: count ?? 0 });
}
