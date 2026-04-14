import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_SORT = ["title", "journal_abbr", "pubmed_indexed_at", "imported_at", "circle", "evidence_score"] as const;
type SortField = typeof ALLOWED_SORT[number];

export async function GET(request: NextRequest) {
  const supabase = createAdminClient();

  const params = request.nextUrl.searchParams;
  const page          = Math.max(1, parseInt(params.get("page") ?? "1", 10));
  const limit         = Math.min(200, Math.max(1, parseInt(params.get("limit") ?? "50", 10)));
  const sortByRaw     = params.get("sort_by") ?? "imported_at";
  const sort_by: SortField = (ALLOWED_SORT as readonly string[]).includes(sortByRaw) ? sortByRaw as SortField : "imported_at";
  const ascending     = params.get("sort_dir") === "asc";
  const search        = params.get("search");
  const mesh_term     = params.get("mesh_term");
  const specialty     = params.get("specialty");
  const subspecialty  = params.get("subspecialty");
  const article_type  = params.get("article_type");
  const pub_date_from = params.get("pub_date_from");
  const pub_date_to   = params.get("pub_date_to");
  const geo_continent = params.get("geo_continent");
  const geo_region    = params.get("geo_region");
  const geo_country   = params.get("geo_country");
  const geo_state     = params.get("geo_state");
  const geo_city      = params.get("geo_city");

  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  let query;

  if (specialty) {
    query = supabase
      .from("articles")
      .select(
        `id, title, journal_abbr, pubmed_indexed_at, imported_at, authors, circle, specialty_tags, abstract, evidence_score, article_type,
         article_specialties!inner(specialty, specialty_match)`,
        { count: "exact" }
      )
      .eq("article_specialties.specialty", specialty)
      .eq("article_specialties.specialty_match", true)
      .order(sort_by, { ascending })
      .range(from, to);
  } else {
    query = supabase
      .from("articles")
      .select(
        "id, title, journal_abbr, pubmed_indexed_at, imported_at, authors, circle, specialty_tags, abstract, evidence_score, article_type",
        { count: "exact" }
      )
      .order(sort_by, { ascending })
      .range(from, to);
  }

  if (search) {
    const isNumeric = /^\d+$/.test(search.trim());
    if (isNumeric) {
      query = query.eq("pmid", search.trim());
    } else {
      query = query.or(
        `title.ilike.%${search.trim()}%,abstract.ilike.%${search.trim()}%`
      );
    }
  }
  if (mesh_term)     query = query.contains("mesh_terms", [{ descriptor: mesh_term }]);
  if (subspecialty)  query = query.contains("subspecialty", [subspecialty]);
  if (article_type)  query = query.eq("article_type", article_type);
  if (pub_date_from) query = query.gte("pubmed_indexed_at", pub_date_from);
  if (pub_date_to)   query = query.lte("pubmed_indexed_at", pub_date_to);
  if (geo_continent) query = query.eq("geo_continent", geo_continent);
  if (geo_region)    query = query.eq("geo_region", geo_region);
  if (geo_country)   query = query.eq("geo_country", geo_country);
  if (geo_state)     query = query.eq("geo_state", geo_state);
  if (geo_city)      query = query.eq("geo_city", geo_city);

  const { data: rows, count, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, rows: rows ?? [], total: count ?? 0 });
}
