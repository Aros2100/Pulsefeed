import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { isoWeekMonday, nameToSlug } from "@/components/editions/types";
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

  const monday    = isoWeekMonday(edition.week_number, edition.year);
  const weekStart = monday.toISOString();
  const weekEnd   = new Date(monday.getTime() + 7 * 86_400_000).toISOString();

  // Fetch all picks for this edition with block-scoping fields
  const { data: picksRows } = await admin
    .from("newsletter_edition_articles")
    .select("article_id, subspecialty, is_global")
    .eq("edition_id", editionId);
  type PickRow = { article_id: string; subspecialty: string | null; is_global: boolean };
  const allPicks = (picksRows ?? []) as PickRow[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[] | null = null;
  let picksSet: Set<string>;

  if (block === "specialty") {
    // Specialty block: PICK star = article is the specialty lead (is_global=true)
    picksSet = new Set(allPicks.filter(p => p.is_global).map(p => p.article_id));

    // Fetch article data directly via the join — avoids a second .in() with ~400 UUIDs
    // which would exceed PostgREST's URL length limit and silently return empty.
    const { data: aspRows } = await admin
      .from("article_specialties")
      .select("articles!inner(id, title, pubmed_id, pubmed_indexed_at, article_type, journal_abbr, subspecialty)")
      .eq("specialty", ACTIVE_SPECIALTY)
      .eq("specialty_match", true)
      .gte("articles.pubmed_indexed_at", weekStart)
      .lt("articles.pubmed_indexed_at", weekEnd)
      .limit(500);

    rows = ((aspRows ?? []) as { articles: Record<string, unknown> }[])
      .map(r => r.articles)
      .filter(Boolean);
  } else {
    // Resolve URL slug → full subspecialty name via the subspecialties table
    const { data: subRows } = await admin
      .from("subspecialties")
      .select("name")
      .eq("specialty", ACTIVE_SPECIALTY)
      .eq("active", true);

    const sub = ((subRows ?? []) as { name: string }[]).find(s => nameToSlug(s.name) === block);
    if (!sub) return NextResponse.json({ articles: [] });

    // Subspecialty block: PICK star = article was specifically picked under this subspecialty
    picksSet = new Set(allPicks.filter(p => p.subspecialty === sub.name).map(p => p.article_id));

    // articles.subspecialty is a text array with full names (e.g. "Spine surgery")
    const { data } = await admin
      .from("articles")
      .select("id, title, pubmed_id, pubmed_indexed_at, article_type, journal_abbr, subspecialty")
      .gte("pubmed_indexed_at", weekStart)
      .lt("pubmed_indexed_at", weekEnd)
      .contains("subspecialty", [sub.name])
      .order("pubmed_indexed_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(500);
    rows = data;
  }

  const result: AllModeArticle[] = ((rows ?? []) as {
    id: string; title: string; pubmed_id: string | null;
    pubmed_indexed_at: string | null; article_type: string | null; journal_abbr: string | null;
    subspecialty: string[] | null;
  }[]).map(a => ({
    ...a,
    editors_pick: picksSet.has(a.id),
    subspecialty: Array.isArray(a.subspecialty) ? a.subspecialty : null,
  }));

  // Picks first, then by date desc
  result.sort((a, b) => {
    if (a.editors_pick !== b.editors_pick) return a.editors_pick ? -1 : 1;
    return (b.pubmed_indexed_at ?? "").localeCompare(a.pubmed_indexed_at ?? "");
  });

  return NextResponse.json({ articles: result, total: result.length });
}
