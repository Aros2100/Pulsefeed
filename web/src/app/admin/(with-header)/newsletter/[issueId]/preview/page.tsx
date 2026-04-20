import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import NewsletterPreviewClient from "./NewsletterPreviewClient";

function isoWeekInterval(weekNumber: number, year: number): { from: string; to: string } {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1) + (weekNumber - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    from: monday.toISOString().slice(0, 10),
    to:   sunday.toISOString().slice(0, 10) + "T23:59:59.999Z",
  };
}

export default async function NewsletterPreviewPage({ params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (user.app_metadata?.role !== "admin") redirect("/");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const [
    { data: edition, error: editionError },
    { data: profileRow },
  ] = await Promise.all([
    admin.from("newsletter_editions").select("id, week_number, year, status, content").eq("id", issueId).single(),
    admin.from("users").select("first_name").eq("id", user.id).maybeSingle(),
  ]);

  if (editionError || !edition) notFound();

  const firstName: string = profileRow?.first_name ?? "";

  const { from, to } = isoWeekInterval(edition.week_number, edition.year);
  console.log("[preview] week interval:", { week: edition.week_number, year: edition.year, from, to });

  const [
    { data: subspecialties },
    { data: editionArticles },
    { data: weekArticles, error: weekError },
  ] = await Promise.all([
    admin.from("subspecialties").select("id, name, sort_order").eq("specialty", ACTIVE_SPECIALTY).eq("active", true).order("sort_order"),
    admin.from("newsletter_edition_articles").select("id, article_id, subspecialty, sort_order, is_global").eq("edition_id", issueId).order("sort_order"),
    admin
      .from("articles")
      .select("id, subspecialty_ai, article_specialties!inner(specialty, specialty_match)")
      .eq("article_specialties.specialty", ACTIVE_SPECIALTY)
      .eq("article_specialties.specialty_match", true)
      .gte("pubmed_indexed_at", from)
      .lte("pubmed_indexed_at", to)
      .limit(5000),
  ]);

  console.log("[preview] weekArticles:", weekArticles?.length ?? 0, "error:", weekError?.message ?? null);

  let pubmedTotal = 0;
  const pubmedBySubspecialty: Record<string, number> = {};
  for (const a of (weekArticles ?? []) as { id: string; subspecialty_ai: string[] | null }[]) {
    pubmedTotal++;
    for (const sub of (a.subspecialty_ai ?? [])) {
      pubmedBySubspecialty[sub] = (pubmedBySubspecialty[sub] ?? 0) + 1;
    }
  }
  console.log("[preview] pubmedTotal:", pubmedTotal, "bySubspecialty keys:", Object.keys(pubmedBySubspecialty).length);

  const articleIds = ((editionArticles ?? []) as { article_id: string }[]).map((ea) => ea.article_id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let articleDetails: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let firstAuthors: any[] = [];

  if (articleIds.length > 0) {
    const [{ data: articles }, { data: authorRows }] = await Promise.all([
      admin.from("articles").select("id, title, article_type, journal_abbr, pubmed_id").in("id", articleIds),
      admin.from("article_authors").select("article_id, authors!inner(display_name, country)").in("article_id", articleIds).eq("position", 1),
    ]);
    articleDetails = articles ?? [];
    firstAuthors = authorRows ?? [];
  }

  console.log("[preview] PROPS SENT → pubmedTotal:", pubmedTotal, "bySubspecialty:", JSON.stringify(pubmedBySubspecialty));

  return (
    <NewsletterPreviewClient
      edition={edition}
      subspecialties={subspecialties ?? []}
      editionArticles={editionArticles ?? []}
      articleDetails={articleDetails}
      firstAuthors={firstAuthors}
      firstName={firstName}
      pubmedTotal={pubmedTotal}
      pubmedBySubspecialty={pubmedBySubspecialty}
    />
  );
}
