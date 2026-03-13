import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: 0 }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const period = params.get("period") ?? "week";
  const subspecialty = params.get("subspecialty");
  const region = params.get("region");

  // Compute date boundary
  const now = new Date();
  let since: Date;
  switch (period) {
    case "month": since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
    case "year":  since = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); break;
    default:      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
  }

  let query = supabase
    .from("articles")
    .select("*", { count: "exact", head: true })
    .eq("status", "approved")
    .gte("imported_at", since.toISOString());

  if (subspecialty) {
    query = query.contains("subspecialty_ai", [subspecialty]);
  }

  if (region) {
    query = query.contains("article_regions", [region]);
  }

  const { count, error } = await query;
  if (error) return NextResponse.json({ count: 0 }, { status: 500 });

  return NextResponse.json({ count: count ?? 0 });
}
