import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

function isoWeekInterval(weekNumber: number, year: number): { from: string; to: string } {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7; // Mon=1…Sun=7
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1) + (weekNumber - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    from: monday.toISOString().slice(0, 10),
    to:   sunday.toISOString().slice(0, 10) + "T23:59:59.999Z",
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const editionId = searchParams.get("editionId");
  if (!editionId) {
    return NextResponse.json({ ok: false, error: "editionId required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Look up edition for week_number + year
  const { data: edition, error: editionError } = await admin
    .from("newsletter_editions")
    .select("week_number, year")
    .eq("id", editionId)
    .single();

  if (editionError || !edition) {
    console.error("[pubmed-stats] edition not found:", editionId, editionError?.message);
    return NextResponse.json({ ok: false, error: "Edition not found" }, { status: 404 });
  }

  const { from, to } = isoWeekInterval(edition.week_number, edition.year);
  console.log("[pubmed-stats] week interval:", { week: edition.week_number, year: edition.year, from, to });

  // Single joined query — avoids the 1000-row limit of a two-step approach
  const { data: rows, error: queryError } = await admin
    .from("articles")
    .select("id, subspecialty_ai, article_specialties!inner(specialty, specialty_match)")
    .eq("article_specialties.specialty", ACTIVE_SPECIALTY)
    .eq("article_specialties.specialty_match", true)
    .gte("pubmed_indexed_at", from)
    .lte("pubmed_indexed_at", to)
    .limit(5000);

  if (queryError) {
    console.error("[pubmed-stats] query error:", queryError.message);
    return NextResponse.json({ ok: false, error: queryError.message }, { status: 500 });
  }

  const articles = (rows ?? []) as { id: string; subspecialty_ai: string[] | null }[];
  console.log("[pubmed-stats] articles in week:", articles.length);

  const total = articles.length;
  const bySubspecialty: Record<string, number> = {};
  for (const a of articles) {
    for (const sub of (a.subspecialty_ai ?? [])) {
      bySubspecialty[sub] = (bySubspecialty[sub] ?? 0) + 1;
    }
  }

  return NextResponse.json({ ok: true, total, bySubspecialty });
}
