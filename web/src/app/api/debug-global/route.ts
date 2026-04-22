import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();

  const { data: edition } = await (supabase as any)
    .from("newsletter_editions")
    .select("id, week_number, year, status")
    .eq("status", "approved")
    .order("year", { ascending: false })
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!edition) return NextResponse.json({ error: "no edition" });

  const { data: rows, error } = await (supabase as any)
    .from("newsletter_edition_articles")
    .select("sort_order, subspecialty, article_id")
    .eq("edition_id", edition.id)
    .eq("is_global", true);

  return NextResponse.json({ edition, rows, error });
}
