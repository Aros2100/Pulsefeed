import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { EditionBand, type EditionData } from "@/components/home/EditionBand";
import { PastEditionsRow } from "@/components/home/PastEditionsRow";
import { FreshFromFeed, type FreshArticle } from "@/components/home/FreshFromFeed";
import { Hero, type HeroData } from "@/components/home/Hero";

// ── ArticleTypeMatrix (unchanged) ─────────────────────────────────────────

const ARTICLE_TYPE_ORDER = [
  "Meta-analysis", "Review", "Intervention study", "Non-interventional study",
  "Basic study", "Case", "Guideline", "Surgical Technique", "Tech",
  "Administration", "Letters & Notices",
];

const ARTICLE_TYPE_DISPLAY: Record<string, string> = {
  "Non-interventional study": "Non-interventional",
  "Surgical Technique": "Surgical technique",
  "Case": "Case report",
};

const ARTICLE_TYPE_TOOLTIP: Record<string, string> = {
  "Meta-analysis": "Pooled quantitative analysis of multiple studies",
  "Review": "Narrative reviews and literature overviews",
  "Intervention study": "RCTs and other interventional trials",
  "Non-interventional study": "Observational research — cohort, registry, cross-sectional",
  "Basic study": "Laboratory, animal, or mechanistic research",
  "Case": "Case reports and case series",
  "Guideline": "Clinical practice guidelines and consensus statements",
  "Surgical Technique": "Step-by-step descriptions of operative procedures",
  "Tech": "New devices, implants, or technology evaluations",
  "Administration": "Health economics, policy, and organizational research",
  "Letters & Notices": "Correspondence, editorials, and brief communications",
};

function ArticleTypeMatrix({ userSubs, shortNameMap, matrixRows }: {
  userSubs: string[];
  shortNameMap: Record<string, string>;
  matrixRows: { subspecialty: string; article_type: string; article_count: number }[];
}) {
  if (userSubs.length === 0) return null;
  const lookup: Record<string, Record<string, number>> = {};
  for (const row of matrixRows) {
    if (!lookup[row.subspecialty]) lookup[row.subspecialty] = {};
    lookup[row.subspecialty][row.article_type] = row.article_count;
  }
  return (
    <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e5e9f0", padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "6px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888" }}>Introducing article types</div>
        <div style={{ fontSize: "11px", color: "#bbb" }}>Last 30 days</div>
      </div>
      <div style={{ fontSize: "12px", color: "#888", marginBottom: "16px", lineHeight: 1.5 }}>
        We classify every article into <span style={{ fontWeight: 600, color: "#444" }}>one of 11 types</span> — here&apos;s what&apos;s published in your subspecialties.
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", paddingLeft: 0, paddingBottom: "10px", borderBottom: "2px solid #f0f2f5" }} />
            {userSubs.map(sub => (
              <th key={sub} style={{ fontSize: "11px", fontWeight: 700, color: "#555", textAlign: "center", padding: "0 6px 10px 6px", borderBottom: "2px solid #f0f2f5", width: "68px" }}>
                {shortNameMap[sub] ?? sub}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ARTICLE_TYPE_ORDER.map((type) => (
            <tr key={type} style={{ borderBottom: "1px solid #f8f9fb" }}>
              <td style={{ fontSize: "12px", fontWeight: 500, color: "#555", padding: "6px 6px 6px 0" }} title={ARTICLE_TYPE_TOOLTIP[type]}>
                {ARTICLE_TYPE_DISPLAY[type] ?? type}
              </td>
              {userSubs.map(sub => {
                const n = lookup[sub]?.[type] ?? 0;
                return (
                  <td key={sub} style={{ fontSize: "12px", fontWeight: 500, textAlign: "center", padding: "6px", color: n === 0 ? "#ddd" : "#444", background: n === 0 ? "transparent" : "#fdf0ef", borderRadius: "4px" }}>
                    {n === 0 ? "—" : n}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Edition data fetching (unchanged) ─────────────────────────────────────

async function fetchEditions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
): Promise<EditionData[]> {
  const { data: editions } = await admin
    .from("newsletter_editions")
    .select("id, week_number, year, published_at:created_at")
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

  return (editions as { id: string; week_number: number; year: number; published_at: string | null }[]).map(e => {
    const leadEntry = leadByEdition[e.id];
    const lead = leadEntry ? articleMap[leadEntry.article_id] : null;
    return {
      id: e.id,
      week_number: e.week_number,
      year: e.year,
      published_at: e.published_at,
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
  const todayIso = now.toISOString().slice(0, 10);
  const yesterdayIso = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const last7Start = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const last14Start = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabase as any;

  const [
    { data: profile },
    { data: subsRows },
    { data: todayFeed },
    editions,
    // Rolling 14-day window: all articles for specialty (articles table is specialty-scoped)
    { data: recentArticles },
  ] = await Promise.all([
    supabase.from("users").select("name, subspecialties").eq("id", user.id).single(),
    admin.from("subspecialties").select("name, short_name").eq("specialty", ACTIVE_SPECIALTY).eq("active", true),
    admin.from("articles")
      .select("id, title, pubmed_id, journal_abbr, pubmed_indexed_at")
      .gte("pubmed_indexed_at", todayIso)
      .order("pubmed_indexed_at", { ascending: false })
      .limit(5),
    fetchEditions(admin),
    // Fetch recent articles with subspecialty for hero computation
    admin.from("articles")
      .select("id, pubmed_indexed_at, subspecialty")
      .gte("pubmed_indexed_at", last14Start)
      .order("pubmed_indexed_at", { ascending: false }),
  ]);

  const firstName = profile?.name?.split(" ")[0] ?? "there";
  const userSubspecialties: string[] = Array.isArray(profile?.subspecialties)
    ? (profile.subspecialties as unknown[]).filter((s): s is string => typeof s === "string")
    : [];
  const shortNameMap: Record<string, string> = Object.fromEntries(
    ((subsRows ?? []) as { name: string; short_name: string | null }[]).map(r => [r.name, r.short_name ?? r.name])
  );
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

  // ── Fresh feed ────────────────────────────────────────────────────────────
  let freshArticles = (todayFeed ?? []) as FreshArticle[];
  let feedLabel: "Today" | "Yesterday" = "Today";
  let feedTotal = freshArticles.length;

  if (freshArticles.length === 0) {
    const { data: yesterdayFeed } = await admin
      .from("articles")
      .select("id, title, pubmed_id, journal_abbr, pubmed_indexed_at")
      .gte("pubmed_indexed_at", yesterdayIso)
      .lt("pubmed_indexed_at", todayIso)
      .order("pubmed_indexed_at", { ascending: false })
      .limit(5);
    freshArticles = (yesterdayFeed ?? []) as FreshArticle[];
    feedLabel = "Yesterday";
    feedTotal = freshArticles.length;
  }

  // ── ArticleTypeMatrix ─────────────────────────────────────────────────────
  let matrixRows: { subspecialty: string; article_type: string; article_count: number }[] = [];
  if (userSubs.length > 0) {
    const { data } = await admin.rpc("get_article_type_matrix", {
      p_subspecialties: userSubs,
      p_from_date: thirtyDaysAgo,
    });
    matrixRows = data ?? [];
  }

  const currentEdition = editions[0] ?? null;
  const pastEditions = editions.slice(1);

  return (
    <>
      {previewBanner}

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 0" }}>
        {/* 1. Hero — volume-first */}
        <Hero data={heroData} />
      </div>

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "0 24px 0" }}>
        {/* 2. Edition band (cream) */}
        {currentEdition && <EditionBand edition={currentEdition} />}

        {/* 3. Past editions row */}
        {pastEditions.length > 0 && (
          <PastEditionsRow
            editions={pastEditions}
            latestEditionId={currentEdition?.id ?? ""}
          />
        )}

        {/* 4. Fresh from the feed */}
        <FreshFromFeed
          articles={freshArticles}
          totalToday={feedTotal}
          label={feedLabel}
        />

        {/* 5. Article type landscape */}
        {userSubs.length > 0 && (
          <div style={{ marginBottom: "80px" }}>
            <ArticleTypeMatrix
              userSubs={userSubs}
              shortNameMap={shortNameMap}
              matrixRows={matrixRows}
            />
          </div>
        )}
      </div>
    </>
  );
}
