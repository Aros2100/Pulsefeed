import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { isoWeekMonday } from "@/components/editions/types";
import type { AllModeArticle } from "@/components/editions/types";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const editionId = searchParams.get("editionId");
  const block     = searchParams.get("block") ?? "specialty";

  if (!editionId) return NextResponse.json({ error: "Missing editionId" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Get edition info for week bounds
  const { data: edition } = await admin
    .from("newsletter_editions")
    .select("week_number, year")
    .eq("id", editionId)
    .in("status", ["approved", "sent"])
    .single();

  if (!edition) return NextResponse.json({ error: "Edition not found" }, { status: 404 });

  const monday = isoWeekMonday(edition.week_number, edition.year);
  const nextMonday = new Date(monday.getTime() + 7 * 86_400_000);
  const weekStart = monday.toISOString();
  const weekEnd   = nextMonday.toISOString();

  // Get picks set for this edition
  const { data: picksRows } = await admin
    .from("newsletter_edition_articles")
    .select("article_id")
    .eq("edition_id", editionId);
  const picksSet = new Set(((picksRows ?? []) as { article_id: string }[]).map(r => r.article_id));

  // Build query for articles this week
  let query = admin
    .from("articles")
    .select("id, title, pubmed_id, pubmed_indexed_at, article_type, journal_abbr")
    .gte("pubmed_indexed_at", weekStart)
    .lt("pubmed_indexed_at", weekEnd)
    .order("pubmed_indexed_at", { ascending: false })
    .limit(200);

  // Specialty filter: use article_specialties join
  if (block === "specialty") {
    // For specialty block, filter via article_specialties
    const { data: aspRows } = await admin
      .from("article_specialties")
      .select("article_id")
      .eq("specialty", ACTIVE_SPECIALTY)
      .eq("specialty_match", true);
    const specialtyIds = ((aspRows ?? []) as { article_id: string }[]).map(r => r.article_id);
    if (specialtyIds.length === 0) {
      return NextResponse.json({ articles: [] });
    }
    query = query.in("id", specialtyIds);
  } else {
    // Subspecialty block: find subspecialty name from slug
    const { data: subRows } = await admin
      .from("subspecialties")
      .select("name")
      .eq("specialty", ACTIVE_SPECIALTY)
      .eq("active", true);

    const { nameToSlug } = await import("@/components/editions/types");
    const sub = ((subRows ?? []) as { name: string }[]).find(s => nameToSlug(s.name) === block);

    if (!sub) return NextResponse.json({ articles: [] });

    // Filter by subspecialty array
    query = query.contains("subspecialty", [sub.name]);
  }

  const { data: articles } = await query;

  const result: AllModeArticle[] = ((articles ?? []) as {
    id: string; title: string; pubmed_id: string | null;
    pubmed_indexed_at: string | null; article_type: string | null; journal_abbr: string | null;
  }[]).map(a => ({
    ...a,
    editors_pick: picksSet.has(a.id),
  }));

  // Sort: picks first, then by date
  result.sort((a, b) => {
    if (a.editors_pick !== b.editors_pick) return a.editors_pick ? -1 : 1;
    return (b.pubmed_indexed_at ?? "").localeCompare(a.pubmed_indexed_at ?? "");
  });

  return NextResponse.json({ articles: result });
}
