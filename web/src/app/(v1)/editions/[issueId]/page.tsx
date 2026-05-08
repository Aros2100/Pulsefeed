import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { EditionClient } from "./EditionClient";
import type { Edition, EditionArticle, SubspecialtyBlock } from "@/components/editions/types";
import { isoWeekMonday, nameToSlug } from "@/components/editions/types";

export default async function EditionPage({
  params,
  searchParams,
}: {
  params: Promise<{ issueId: string }>;
  searchParams: Promise<{ block?: string; view?: string }>;
}) {
  const { issueId } = await params;
  const { block: blockParam = "specialty", view: viewParam = "picks" } = await searchParams;
  const view = viewParam === "all" ? "all" : "picks";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Allow unauthenticated for now; redirect if needed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Fetch edition (only approved/sent)
  const { data: editionRaw } = await admin
    .from("newsletter_editions")
    .select("id, week_number, year, status, specialty, published_at, created_at")
    .eq("id", issueId)
    .in("status", ["approved", "sent"])
    .single();

  if (!editionRaw) notFound();

  const edition = editionRaw as Edition & { created_at: string };

  // published_at fallback to created_at
  const resolvedEdition: Edition = {
    ...edition,
    published_at: edition.published_at ?? edition.created_at,
  };

  // Week bounds for "total articles" count
  const monday = isoWeekMonday(edition.week_number, edition.year);
  const nextMonday = new Date(monday.getTime() + 7 * 86_400_000);

  // Fetch in parallel
  const [
    { data: allEditions },
    { data: subspecialtyRows },
    { data: editionArticlesRaw },
    { data: profileRow },
    { data: weekSpecialtyData },
    { data: picksCountRows },
  ] = await Promise.all([
    // All published editions for navigation
    admin
      .from("newsletter_editions")
      .select("id, published_at, created_at")
      .eq("specialty", ACTIVE_SPECIALTY)
      .in("status", ["approved", "sent"])
      .order("year", { ascending: false })
      .order("week_number", { ascending: false }),

    // Subspecialties with pick counts for sidebar
    admin
      .from("subspecialties")
      .select("id, name, short_name, sort_order")
      .eq("specialty", ACTIVE_SPECIALTY)
      .eq("active", true)
      .order("sort_order"),

    // All edition articles with article details
    admin
      .from("newsletter_edition_articles")
      .select(`
        id, article_id, sort_order, global_sort_order, is_global, subspecialty,
        newsletter_headline, newsletter_subheadline,
        articles!inner(title, pubmed_id, pubmed_indexed_at, article_type, journal_abbr, sari_subject, subspecialty)
      `)
      .eq("edition_id", issueId)
      .order("sort_order"),

    // User profile for subspecialties
    user
      ? supabase.from("users").select("subspecialties").eq("id", user.id).single()
      : Promise.resolve({ data: null }),

    // Specialty articles for this week WITH subspecialty arrays — used to derive
    // both the specialty-level total and per-block counts for the "All · N" toggle.
    // Fetches data (not head:true) so we can group by subspecialty in JS.
    admin
      .from("article_specialties")
      .select("article_id, articles!inner(subspecialty)")
      .eq("specialty", ACTIVE_SPECIALTY)
      .eq("specialty_match", true)
      .gte("articles.pubmed_indexed_at", monday.toISOString())
      .lt("articles.pubmed_indexed_at", nextMonday.toISOString())
      .limit(1000),

    // Pick counts per subspecialty
    admin
      .from("newsletter_edition_articles")
      .select("subspecialty, is_global")
      .eq("edition_id", issueId),
  ]);

  // Build picks count per subspecialty.
  // A global (is_global=true) article is the specialty lead AND still belongs to its native
  // subspecialty — count it in both specialtyPickCount and subPickCounts.
  const subPickCounts: Record<string, number> = {};
  let specialtyPickCount = 0;
  for (const row of ((picksCountRows ?? []) as { subspecialty: string | null; is_global: boolean }[])) {
    if (row.is_global) specialtyPickCount++;
    if (row.subspecialty) {
      subPickCounts[row.subspecialty] = (subPickCounts[row.subspecialty] ?? 0) + 1;
    }
  }

  // Build sidebar subspecialty blocks
  const subspecialties: SubspecialtyBlock[] = ((subspecialtyRows ?? []) as {
    id: string; name: string; short_name: string | null; sort_order: number;
  }[]).map(s => ({
    id: s.id,
    name: s.name,
    short_name: s.short_name,
    sort_order: s.sort_order,
    pick_count: subPickCounts[s.name] ?? 0,
  }));

  // Build edition articles
  const picksArticles: EditionArticle[] = ((editionArticlesRaw ?? []) as Record<string, unknown>[]).map(row => {
    const a = row.articles as Record<string, unknown>;
    return {
      ea_id:                   row.id as string,
      article_id:              row.article_id as string,
      sort_order:              row.sort_order as number,
      global_sort_order:       row.global_sort_order as number | null,
      is_global:               row.is_global as boolean,
      subspecialty:            row.subspecialty as string | null,
      articleSubspecialties:   Array.isArray(a?.subspecialty) ? (a.subspecialty as string[]) : null,
      newsletter_headline:     row.newsletter_headline as string | null,
      newsletter_subheadline:  row.newsletter_subheadline as string | null,
      title:                   a?.title as string,
      pubmed_id:               a?.pubmed_id as string | null,
      pubmed_indexed_at:       a?.pubmed_indexed_at as string | null,
      article_type:            a?.article_type as string | null,
      journal_abbr:            a?.journal_abbr as string | null,
      sari_subject:            a?.sari_subject as string | null,
    };
  });

  // Navigation: prev/next editions
  const sortedEditions = ((allEditions ?? []) as { id: string; published_at: string | null; created_at: string }[])
    .map(e => ({ id: e.id, date: e.published_at ?? e.created_at }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const currentIndex = sortedEditions.findIndex(e => e.id === issueId);
  const prevEditionId = currentIndex < sortedEditions.length - 1 ? sortedEditions[currentIndex + 1].id : null;
  const nextEditionId = currentIndex > 0 ? sortedEditions[currentIndex - 1].id : null;
  const isLatest = currentIndex === 0;

  // User subspecialties
  const rawSubs = profileRow?.subspecialties;
  const userSubNames: string[] = Array.isArray(rawSubs)
    ? (rawSubs as unknown[]).filter((s): s is string => typeof s === "string" && s !== "Neurosurgery")
    : [];

  // Derive specialty total + per-block counts from the week data
  type WeekRow = { article_id: string; articles: { subspecialty: string[] | null } };
  const weekRows = (weekSpecialtyData ?? []) as WeekRow[];
  const totalArticlesThisWeek = weekRows.length;

  const blockCounts: Record<string, number> = { specialty: totalArticlesThisWeek };
  for (const sub of subspecialties) {
    const slug = nameToSlug(sub.name);
    blockCounts[slug] = weekRows.filter(
      r => Array.isArray(r.articles?.subspecialty) && r.articles.subspecialty.includes(sub.name)
    ).length;
  }

  return (
    <Suspense fallback={null}>
      <EditionClient
        edition={resolvedEdition}
        isLatest={isLatest}
        prevEditionId={prevEditionId}
        nextEditionId={nextEditionId}
        subspecialties={subspecialties}
        userSubNames={userSubNames}
        picksArticles={picksArticles}
        specialtyPickCount={specialtyPickCount}
        totalArticlesThisWeek={totalArticlesThisWeek}
        blockCounts={blockCounts}
        initialBlock={blockParam}
        initialView={view}
      />
    </Suspense>
  );
}
