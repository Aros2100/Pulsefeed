import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { PageContainer } from "@/components/layout/PageContainer";
import { EditionBand, type EditionData } from "@/components/home/EditionBand";
import { PastEditionsRow } from "@/components/home/PastEditionsRow";
import { Hero, type HeroData } from "@/components/home/Hero";

// ── Edition data fetching (unchanged) ─────────────────────────────────────

async function fetchEditions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
): Promise<EditionData[]> {
  const { data: editions } = await admin
    .from("newsletter_editions")
    .select("id, week_number, year, published_at, created_at")
    .eq("specialty", ACTIVE_SPECIALTY)
    .in("status", ["approved", "sent"])
    .order("year", { ascending: false })
    .order("week_number", { ascending: false })
    .limit(4);

  if (!editions || editions.length === 0) return [];

  const editionIds = (editions as { id: string }[]).map(e => e.id);

  const { data: leadRows } = await admin
    .from("newsletter_edition_articles")
    .select("edition_id, article_id, global_sort_order, sort_order, newsletter_subheadline")
    .in("edition_id", editionIds)
    .eq("is_global", true)
    .order("global_sort_order", { ascending: true, nullsFirst: false });

  const leadByEdition: Record<string, { article_id: string; newsletter_subheadline: string | null }> = {};
  for (const row of ((leadRows ?? []) as { edition_id: string; article_id: string; global_sort_order: number | null; sort_order: number; newsletter_subheadline: string | null }[])) {
    if (!leadByEdition[row.edition_id]) {
      leadByEdition[row.edition_id] = { article_id: row.article_id, newsletter_subheadline: row.newsletter_subheadline };
    }
  }

  const leadArticleIds = [...new Set(Object.values(leadByEdition).map(l => l.article_id))];
  let articleMap: Record<string, { title: string; pubmed_id: string | null; sari_subject: string | null }> = {};
  if (leadArticleIds.length > 0) {
    const { data: articles } = await admin
      .from("articles")
      .select("id, title, pubmed_id, sari_subject")
      .in("id", leadArticleIds);
    articleMap = Object.fromEntries(
      ((articles ?? []) as { id: string; title: string; pubmed_id: string | null; sari_subject: string | null }[])
        .map(a => [a.id, a])
    );
  }

  const { data: countRows } = await admin
    .from("newsletter_edition_articles")
    .select("edition_id")
    .in("edition_id", editionIds);

  const countByEdition: Record<string, number> = {};
  for (const row of ((countRows ?? []) as { edition_id: string }[])) {
    countByEdition[row.edition_id] = (countByEdition[row.edition_id] ?? 0) + 1;
  }

  return (editions as { id: string; week_number: number; year: number; published_at: string | null; created_at: string }[]).map(e => {
    const leadEntry = leadByEdition[e.id];
    const lead = leadEntry ? articleMap[leadEntry.article_id] : null;
    return {
      id: e.id,
      week_number: e.week_number,
      year: e.year,
      published_at: e.published_at ?? e.created_at,
      lead_title: lead?.title ?? null,
      lead_pubmed_id: lead?.pubmed_id ?? null,
      lead_sari_subject: lead?.sari_subject ?? null,
      lead_subheadline: leadEntry?.newsletter_subheadline ?? null,
      total_picks: countByEdition[e.id] ?? 0,
    };
  });
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function HomeV1() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const pfVersionCookie = cookieStore.get("pf-version")?.value;
  const isAdminUser = user.app_metadata?.role === "admin";
  const showPreviewBanner = isAdminUser && !!pfVersionCookie;
  const previewVersion = pfVersionCookie === "v2" ? "v2" : "v1";

  const previewBanner = showPreviewBanner ? (
    <div style={{
      background: previewVersion === "v2" ? "#fee2e2" : "#fef3c7",
      borderBottom: `1px solid ${previewVersion === "v2" ? "#f87171" : "#f59e0b"}`,
      padding: "6px 16px", fontSize: "12px", fontWeight: 600,
      color: previewVersion === "v2" ? "#991b1b" : "#92400e",
      textAlign: "center", letterSpacing: "0.03em",
    }}>
      DEV PREVIEW — {previewVersion.toUpperCase()}
    </div>
  ) : null;

  const now = new Date();
  const last7Start = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const last14Start = new Date(now.getTime() - 14 * 86_400_000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabase as any;

  const [
    { data: profile },
    editions,
    { data: recentArticles },
  ] = await Promise.all([
    supabase.from("users").select("name, subspecialties").eq("id", user.id).single(),
    fetchEditions(admin),
    admin.from("articles")
      .select("id, pubmed_indexed_at, subspecialty")
      .gte("pubmed_indexed_at", last14Start)
      .order("pubmed_indexed_at", { ascending: false }),
  ]);

  const firstName = profile?.name?.split(" ")[0] ?? "there";
  const userSubspecialties: string[] = Array.isArray(profile?.subspecialties)
    ? (profile.subspecialties as unknown[]).filter((s): s is string => typeof s === "string")
    : [];
  const userSubs = userSubspecialties.filter(s => s.toLowerCase() !== "neurosurgery");

  // ── Hero data computation ────────────────────────────────────────────────
  type ArticleRow = { id: string; pubmed_indexed_at: string | null; subspecialty: unknown };
  const allRecent = (recentArticles ?? []) as ArticleRow[];
  const last7StartDate = new Date(last7Start);

  const totalLast7 = allRecent.filter(a => a.pubmed_indexed_at && new Date(a.pubmed_indexed_at) >= last7StartDate).length;
  const totalPrev7  = allRecent.filter(a => a.pubmed_indexed_at && new Date(a.pubmed_indexed_at) < last7StartDate).length;
  const deltaPct = totalPrev7 > 0 ? Math.round((totalLast7 - totalPrev7) / totalPrev7 * 100) : 0;

  const heroSubspecialties: HeroData["subspecialties"] = userSubs.map(subName => {
    const last7 = allRecent.filter(a =>
      a.pubmed_indexed_at &&
      new Date(a.pubmed_indexed_at) >= last7StartDate &&
      Array.isArray(a.subspecialty) && (a.subspecialty as string[]).includes(subName)
    ).length;
    const prev7 = allRecent.filter(a =>
      a.pubmed_indexed_at &&
      new Date(a.pubmed_indexed_at) < last7StartDate &&
      Array.isArray(a.subspecialty) && (a.subspecialty as string[]).includes(subName)
    ).length;
    return {
      name: subName,
      last7Days: last7,
      previousDays: prev7,
      deltaAbs: last7 - prev7,
    };
  });

  const hour = now.getHours();
  const timeOfDay: HeroData["timeOfDay"] = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  const heroData: HeroData = {
    firstName,
    timeOfDay,
    total: {
      last7Days: totalLast7,
      previousDays: totalPrev7,
      deltaPct,
      perDay: Math.round(totalLast7 / 7),
    },
    subspecialties: heroSubspecialties,
  };

  const currentEdition = editions[0] ?? null;
  const pastEditions = editions.slice(1).reverse();

  return (
    <>
      {previewBanner}

      <PageContainer>
        {/* 1. Hero — volume-first */}
        <div style={{ paddingTop: "40px" }}>
          <Hero data={heroData} />
        </div>

        {/* 2. Edition band (cream) */}
        {currentEdition && <EditionBand edition={currentEdition} />}

        {/* 3. Past editions row */}
        {pastEditions.length > 0 && (
          <PastEditionsRow
            editions={pastEditions}
            latestEditionId={currentEdition?.id ?? ""}
          />
        )}

      </PageContainer>
    </>
  );
}
