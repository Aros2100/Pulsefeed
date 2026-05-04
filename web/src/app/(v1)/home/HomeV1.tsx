import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";
import { EditionBand, type EditionData } from "@/components/home/EditionBand";
import { PastEditionsRow } from "@/components/home/PastEditionsRow";
import { FreshFromFeed, type FreshArticle } from "@/components/home/FreshFromFeed";

function getWeekNum(iso: string): number {
  const d = new Date(iso);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  return Math.round((d.getTime() - startOfWeek1.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
}

// ── ActivityWidget ─────────────────────────────────────────────────────────

function ActivityWidget({
  weeklyCount, monthlyCount, yearlyCount, weekStarts,
  userSubs, subWeekCounts, shortNameMap, greeting, firstName, weekNumber, year,
}: {
  weeklyCount: number; monthlyCount: number; yearlyCount: number;
  weekStarts: string[];
  userSubs: string[];
  subWeekCounts: { subspecialty: string; week_start: string; article_count: number }[];
  shortNameMap: Record<string, string>;
  greeting: string; firstName: string; weekNumber: number; year: number;
}) {
  const getWk = (iso: string) => {
    const d = new Date(iso);
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const s = new Date(jan4);
    s.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
    return Math.round((d.getTime() - s.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  };

  const lookup: Record<string, Record<string, number>> = {};
  for (const row of subWeekCounts) {
    if (!lookup[row.subspecialty]) lookup[row.subspecialty] = {};
    lookup[row.subspecialty][row.week_start] = row.article_count;
  }
  const globalMax = Math.max(1, ...userSubs.flatMap(sub => weekStarts.map(ws => lookup[sub]?.[ws] ?? 0)));
  const divider = <div style={{ width: "1px", background: "#f0f2f5", flexShrink: 0, alignSelf: "stretch" }} />;

  return (
    <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e5e9f0", padding: "22px 28px" }}>
      <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
        <div style={{ flex: "1", display: "flex", flexDirection: "column", justifyContent: "center", paddingRight: "18px" }}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#1a1a1a", lineHeight: 1.2 }}>{greeting}, {firstName}</div>
          <div style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>Week {weekNumber}, {year}</div>
        </div>
        {divider}
        <div style={{ flex: "0.9", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 18px" }}>
          <div style={{ fontSize: "9.5px", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "#b0b6bf" }}>New articles in</div>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#E83B2A" }}>Neurosurgery</div>
          <div style={{ fontSize: "38px", fontWeight: 800, lineHeight: 1, color: "#1a1a1a", marginTop: "6px" }}>{weeklyCount}</div>
          <div style={{ fontSize: "9.5px", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "#E83B2A", marginTop: "4px" }}>So far this week</div>
        </div>
        {divider}
        <div style={{ flex: "0.9", display: "flex", flexDirection: "column", justifyContent: "center", gap: "12px", padding: "0 18px" }}>
          <div>
            <div style={{ fontSize: "10px", fontWeight: 600, color: "#888", marginBottom: "2px" }}>This month</div>
            <div style={{ fontSize: "28px", fontWeight: 800, lineHeight: 1, color: "#1a1a1a" }}>{(monthlyCount as number | null)?.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: "10px", fontWeight: 600, color: "#888", marginBottom: "2px" }}>This year</div>
            <div style={{ fontSize: "28px", fontWeight: 800, lineHeight: 1, color: "#1a1a1a" }}>{(yearlyCount as number | null)?.toLocaleString()}</div>
          </div>
        </div>
        {divider}
        {userSubs.length > 0 && (
          <div style={{ flex: "1.6", display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: "18px" }}>
            <div style={{ fontSize: "9.5px", fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "#b0b6bf", marginBottom: "10px" }}>Your subspecialties</div>
            <div style={{ display: "grid", gridTemplateColumns: `95px repeat(${weekStarts.length}, 1fr)`, gap: "5px" }}>
              <div />
              {weekStarts.map((ws, i) => (
                <div key={ws} style={{ fontSize: "9.5px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", textAlign: "center", paddingBottom: "4px", color: i === weekStarts.length - 1 ? "#E83B2A" : "#b0b6bf" }}>
                  W{getWk(ws)}
                </div>
              ))}
            </div>
            {userSubs.map((sub) => {
              const counts = weekStarts.map(ws => lookup[sub]?.[ws] ?? 0);
              return (
                <div key={sub} style={{ display: "grid", gridTemplateColumns: `95px repeat(${weekStarts.length}, 1fr)`, gap: "5px", marginBottom: "4px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "#444", display: "flex", alignItems: "flex-end", paddingBottom: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {shortNameMap[sub] ?? sub}
                  </div>
                  {counts.map((count, i) => {
                    const isCurrent = i === counts.length - 1;
                    return (
                      <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                        <div style={{ width: "100%", height: "40px", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                          <div style={{ width: "100%", borderRadius: "2px", minHeight: count > 0 ? "3px" : "0", height: `${Math.round((count / globalMax) * 100)}%`, background: isCurrent ? "#E83B2A" : "#f0f2f5" }} />
                        </div>
                        <div style={{ fontSize: "10px", fontWeight: isCurrent ? 700 : 600, color: isCurrent ? "#E83B2A" : "#888", textAlign: "center" }}>{count}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ArticleTypeMatrix ──────────────────────────────────────────────────────

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

// ── Data helpers ────────────────────────────────────────────────────────────

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

  // Lead articles per edition (is_global=true, lowest global_sort_order)
  const { data: leadRows } = await admin
    .from("newsletter_edition_articles")
    .select("edition_id, article_id, global_sort_order, sort_order, newsletter_subheadline")
    .in("edition_id", editionIds)
    .eq("is_global", true)
    .order("global_sort_order", { ascending: true, nullsFirst: false });

  // Pick lowest global_sort_order per edition (stores article_id + subheadline)
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

  // Counts per edition
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
  const daysFromMonday = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysFromMonday);
  const startOfWeekIso = monday.toISOString().slice(0, 10);
  const todayIso = now.toISOString().slice(0, 10);
  const yesterdayIso = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const currentWeekNumber = getWeekNum(startOfWeekIso);
  const currentYear = now.getFullYear();

  const weekStarts: string[] = [];
  for (let i = 4; i >= 0; i--) {
    const d = new Date(monday);
    d.setDate(monday.getDate() - i * 7);
    weekStarts.push(d.toISOString().slice(0, 10));
  }

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const firstOfYear  = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabase as any;

  const [
    { data: profile },
    { data: subsRows },
    { data: weeklyCount },
    { data: monthlyCount },
    { data: yearlyCount },
    { data: todayFeed },
    editions,
  ] = await Promise.all([
    supabase.from("users").select("name, subspecialties").eq("id", user.id).single(),
    admin.from("subspecialties").select("name, short_name").eq("specialty", ACTIVE_SPECIALTY).eq("active", true),
    admin.rpc("count_articles_this_week", { week_start: startOfWeekIso, week_end: todayIso }),
    admin.rpc("count_articles_in_range", { p_from: firstOfMonth, p_to: todayIso }),
    admin.rpc("count_articles_in_range", { p_from: firstOfYear,  p_to: todayIso }),
    admin.from("articles")
      .select("id, title, pubmed_id, journal_abbr, pubmed_indexed_at")
      .gte("pubmed_indexed_at", todayIso)
      .order("pubmed_indexed_at", { ascending: false })
      .limit(5),
    fetchEditions(admin),
  ]);

  const firstName = profile?.name?.split(" ")[0] ?? "there";
  const userSubspecialties: string[] = Array.isArray(profile?.subspecialties)
    ? (profile.subspecialties as unknown[]).filter((s): s is string => typeof s === "string")
    : [];
  const shortNameMap: Record<string, string> = Object.fromEntries(
    ((subsRows ?? []) as { name: string; short_name: string | null }[]).map(r => [r.name, r.short_name ?? r.name])
  );
  const userSubs = userSubspecialties.filter(s => s.toLowerCase() !== "neurosurgery");

  // Fresh feed: today or yesterday fallback
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

  // Subspecialty activity widget data
  let subWeekCounts: { subspecialty: string; week_start: string; article_count: number }[] = [];
  if (userSubs.length > 0) {
    const { data } = await admin.rpc("count_subspecialties_by_weeks", {
      p_subspecialties: userSubs,
      p_week_starts: weekStarts,
    });
    subWeekCounts = data ?? [];
  }

  let matrixRows: { subspecialty: string; article_type: string; article_count: number }[] = [];
  if (userSubs.length > 0) {
    const { data } = await admin.rpc("get_article_type_matrix", {
      p_subspecialties: userSubs,
      p_from_date: thirtyDaysAgo,
    });
    matrixRows = data ?? [];
  }

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const currentEdition = editions[0] ?? null;
  const pastEditions = editions.slice(1);

  return (
    <>
      {previewBanner}

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 16px" }}>
        {/* 1. Hero band */}
        <ActivityWidget
          weeklyCount={weeklyCount ?? 0}
          monthlyCount={monthlyCount ?? 0}
          yearlyCount={yearlyCount ?? 0}
          weekStarts={weekStarts}
          userSubs={userSubs}
          subWeekCounts={subWeekCounts}
          shortNameMap={shortNameMap}
          greeting={greeting}
          firstName={firstName}
          weekNumber={currentWeekNumber}
          year={currentYear}
        />
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
