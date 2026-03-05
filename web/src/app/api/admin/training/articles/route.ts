import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SPECIALTY_SLUGS } from "@/lib/auth/specialties";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const specialty = request.nextUrl.searchParams.get("specialty");
  if (!specialty || !(SPECIALTY_SLUGS as readonly string[]).includes(specialty)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid specialty" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: articles, error } = await admin
    .from("articles")
    .select("id, title, journal_abbr, journal_title, published_date, abstract, pubmed_id, authors, specialty_confidence, circle")
    .eq("status", "pending")
    .order("circle", { ascending: false })                          // C3 before C2
    .order("imported_at", { ascending: true })                     // oldest first within same circle
    .order("specialty_confidence", { ascending: true, nullsFirst: false })  // tiebreaker
    .limit(100);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, articles: articles ?? [] });
}
