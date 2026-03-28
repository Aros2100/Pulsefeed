import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: 0 }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const period      = params.get("period") ?? "uge";
  const subspecialty = params.get("subspecialty");
  const country     = params.get("country");
  const city        = params.get("city");
  const region      = params.get("region");

  const now = new Date();
  let since: Date;
  switch (period) {
    case "måned": since = new Date(now.getTime() - 30  * 24 * 60 * 60 * 1000); break;
    case "år":    since = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); break;
    default:      since = new Date(now.getTime() - 7   * 24 * 60 * 60 * 1000); break;
  }

  // Fetch approved article IDs from article_specialties (source of truth for approval status)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: approvedIdRows } = await (supabase as any)
    .from("article_specialties")
    .select("article_id")
    .eq("specialty_match", true);
  const approvedArticleIds = (approvedIdRows ?? []).map((r: { article_id: string }) => r.article_id);

  let query = supabase
    .from("articles")
    .select("*", { count: "exact", head: true })
    .in("id", approvedArticleIds.length > 0 ? approvedArticleIds : ["00000000-0000-0000-0000-000000000000"]);

  if (period !== "alle") {
    query = query.gte("imported_at", since.toISOString());
  }

  if (subspecialty) query = query.contains("subspecialty_ai",   [subspecialty]);
  if (country)      query = query.contains("article_countries", [country]);
  if (city)         query = query.contains("article_cities",    [city]);
  if (region)       query = query.eq("geo_region",              region);

  const { count, error } = await query;
  if (error) return NextResponse.json({ count: 0 }, { status: 500 });

  return NextResponse.json({ count: count ?? 0 });
}
