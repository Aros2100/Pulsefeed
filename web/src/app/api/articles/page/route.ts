import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 25;

function periodSince(period: string): string {
  const now = Date.now();
  switch (period) {
    case "måned": return new Date(now - 30  * 24 * 60 * 60 * 1000).toISOString();
    case "år":    return new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();
    default:      return new Date(now - 7   * 24 * 60 * 60 * 1000).toISOString();
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users").select("specialty_slugs").eq("id", user.id).single();
  const specialtySlugs: string[] = profile?.specialty_slugs ?? [];

  const params = request.nextUrl.searchParams;
  const period       = params.get("period");
  const subspecialty = params.get("subspecialty");
  const region       = params.get("region");
  const country      = params.get("country");
  const city         = params.get("city");
  const institution  = params.get("institution");
  const page         = Math.max(1, parseInt(params.get("page") ?? "1", 10));

  const from = (page - 1) * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  let query = supabase
    .from("articles")
    .select("id, title, journal_abbr, published_date, authors, publication_types, news_value, clinical_relevance, enriched_at, imported_at", { count: "exact" })
    .eq("status", "approved")
    .order("imported_at", { ascending: false })
    .range(from, to);

  if (specialtySlugs.length > 0) {
    query = query.contains("specialty_tags", specialtySlugs);
  }

  if (!period || period !== "alle") {
    query = query.gte("imported_at", periodSince(period ?? "uge"));
  }

  if (subspecialty) query = query.contains("subspecialty_ai",      [subspecialty]);
  if (region)       query = query.contains("article_regions",      [region]);
  if (country)      query = query.contains("article_countries",    [country]);
  if (city)         query = query.contains("article_cities",       [city]);
  if (institution)  query = query.contains("article_institutions", [institution]);

  const { data: articles, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const totalCount = count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return NextResponse.json({ articles: articles ?? [], totalCount, totalPages });
}
