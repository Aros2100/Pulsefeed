import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { NewsletterArticle, NewsletterContent } from "@/lib/newsletter/send";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";


function getWeekNum(iso: string): number {
  const d = new Date(iso);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  return Math.round((d.getTime() - startOfWeek1.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
}

function formatDate(d: string | null): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return ""; }
}

function ArticleBadge({ type }: { type: string }) {
  return (
    <span style={{
      display: "inline-block",
      fontSize: "11px",
      fontWeight: 600,
      color: "#E83B2A",
      background: "#fef2f2",
      borderRadius: "4px",
      padding: "2px 7px",
      letterSpacing: "0.02em",
    }}>
      {type}
    </span>
  );
}

function ArticleCard({ article }: { article: NewsletterArticle }) {
  const pubmedUrl = article.pubmed_id
    ? `https://pubmed.ncbi.nlm.nih.gov/${article.pubmed_id}/`
    : null;

  const meta = [article.journal_abbr, formatDate(article.published_date)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={{
      background: "#fff",
      borderRadius: "10px",
      border: "1px solid #e5e9f0",
      padding: "18px 20px",
      marginBottom: "10px",
    }}>
      <div style={{ fontSize: "15px", fontWeight: 700, color: "#1a1a1a", lineHeight: 1.4, marginBottom: "6px" }}>
        {pubmedUrl ? (
          <a href={pubmedUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1a1a1a", textDecoration: "none" }}>
            {article.title}
          </a>
        ) : article.title}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: article.short_resume ? "10px" : 0 }}>
        {article.article_type && <ArticleBadge type={article.article_type} />}
        {meta && <span style={{ fontSize: "12px", color: "#888" }}>{meta}</span>}
      </div>
      {article.short_resume && (
        <div style={{ fontSize: "13px", color: "#555", lineHeight: 1.65 }}>
          {article.short_resume}
        </div>
      )}
      {pubmedUrl && (
        <div style={{ marginTop: "10px" }}>
          <a href={pubmedUrl} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: "12px", color: "#E83B2A", fontWeight: 600, textDecoration: "none" }}>
            Read on PubMed →
          </a>
        </div>
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: "11px",
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "#E83B2A",
      borderBottom: "2px solid #E83B2A",
      paddingBottom: "8px",
      marginBottom: "14px",
    }}>
      {children}
    </div>
  );
}

function ActivityWidget({
  weeklyCount,
  monthlyCount,
  yearlyCount,
  weekStarts,
  userSubs,
  subWeekCounts,
  shortNameMap,
}: {
  weeklyCount: number;
  monthlyCount: number;
  yearlyCount: number;
  weekStarts: string[];
  userSubs: string[];
  subWeekCounts: { subspecialty: string; week_start: string; article_count: number }[];
  shortNameMap: Record<string, string>;
}) {
  const getWeekNum = (iso: string) => {
    const d = new Date(iso);
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const startOfWeek1 = new Date(jan4);
    startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
    return Math.round((d.getTime() - startOfWeek1.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  };

  const lookup: Record<string, Record<string, number>> = {};
  for (const row of subWeekCounts) {
    if (!lookup[row.subspecialty]) lookup[row.subspecialty] = {};
    lookup[row.subspecialty][row.week_start] = row.article_count;
  }

  return (
    <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e5e9f0", padding: "24px 28px" }}>
      <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>

        {/* Left: this week */}
        <div style={{ flex: "0 0 180px", display: "flex", flexDirection: "column", justifyContent: "center", paddingRight: "28px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#bbb", marginBottom: "4px" }}>New articles in</div>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#E83B2A", marginBottom: "20px" }}>Neurosurgery</div>
          <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "6px" }}>This week</div>
          <div style={{ fontSize: "52px", fontWeight: 800, color: "#1a1a1a", lineHeight: 1 }}>{weeklyCount}</div>
          <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#E83B2A", marginTop: "3px" }}>so far</div>
        </div>

        <div style={{ width: "1px", background: "#f0f2f5", flexShrink: 0, margin: "0 28px", alignSelf: "stretch" }} />

        {/* Middle: month + year */}
        <div style={{ flex: "0 0 140px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "20px" }}>
          <div>
            <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "4px" }}>This month</div>
            <div style={{ fontSize: "32px", fontWeight: 800, color: "#1a1a1a", lineHeight: 1 }}>{(monthlyCount as number | null)?.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "4px" }}>This year</div>
            <div style={{ fontSize: "32px", fontWeight: 800, color: "#1a1a1a", lineHeight: 1 }}>{(yearlyCount as number | null)?.toLocaleString()}</div>
          </div>
        </div>

        <div style={{ width: "1px", background: "#f0f2f5", flexShrink: 0, margin: "0 28px", alignSelf: "stretch" }} />

        {/* Right: subspecialty bars */}
        {userSubs.length > 0 && (
          <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ flex: "0 0 150px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#bbb" }}>Your subspecialties</div>
              <div style={{ display: "flex", gap: "4px" }}>
                {weekStarts.map((ws, i) => (
                  <div key={ws} style={{ width: "30px", textAlign: "center", fontSize: "9px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: i === weekStarts.length - 1 ? "#E83B2A" : "#ccc" }}>
                    W{getWeekNum(ws)}
                  </div>
                ))}
              </div>
            </div>

            {userSubs.map((sub) => {
              const counts = weekStarts.map(ws => lookup[sub]?.[ws] ?? 0);
              const max = Math.max(...counts, 1);
              return (
                <div key={sub} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                  <div style={{ flex: "0 0 150px", fontSize: "12px", fontWeight: 600, color: "#444", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {shortNameMap[sub] ?? sub}
                  </div>
                  <div style={{ display: "flex", gap: "4px", alignItems: "flex-end" }}>
                    {counts.map((count, i) => {
                      const isCurrent = i === counts.length - 1;
                      const heightPct = Math.round((count / max) * 100);
                      return (
                        <div key={i} style={{ width: "30px", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                          <div style={{ width: "100%", height: "28px", display: "flex", alignItems: "flex-end" }}>
                            <div style={{ width: "100%", borderRadius: "2px 2px 0 0", minHeight: "3px", height: `${heightPct}%`, background: isCurrent ? "#E83B2A" : "#e5e9f0", opacity: isCurrent ? 0.8 : 1 }} />
                          </div>
                          <div style={{ fontSize: "10px", fontWeight: 700, color: isCurrent ? "#E83B2A" : "#999", textAlign: "center" }}>{count}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function NewsletterSection({
  edition,
  prevEditions,
}: {
  edition: { week_number: number; year: number; content: { global_intro?: string } };
  prevEditions: { id: string; week_number: number; year: number }[];
}) {
  return (
    <div style={{ marginTop: "24px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", marginBottom: "12px" }}>
        Newsletter
      </div>

      {/* Hero */}
      <div style={{
        background: "#fff", borderRadius: "12px", border: "1px solid #e5e9f0",
        padding: "20px 24px", marginBottom: "8px",
        display: "flex", alignItems: "center", gap: "0",
      }}>
        <div style={{ flex: "2 1 0", minWidth: 0, paddingRight: "24px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#E83B2A", marginBottom: "6px" }}>
            Week {edition.week_number}, {edition.year}
          </div>
          <div style={{ fontSize: "13px", color: "#444", lineHeight: 1.65 }}>
            {edition.content.global_intro ?? ""}
          </div>
        </div>
        <div style={{ width: "1px", alignSelf: "stretch", background: "#e5e9f0", flexShrink: 0 }} />
        <div style={{ flex: "1 1 0", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <a href="#" style={{
            fontSize: "12px", fontWeight: 600, color: "#E83B2A",
            border: "1.5px solid #E83B2A", borderRadius: "6px",
            padding: "6px 16px", textDecoration: "none", whiteSpace: "nowrap",
          }}>
            Open →
          </a>
        </div>
      </div>

      {/* Previous editions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
        {prevEditions.length > 0 ? prevEditions.map((e) => (
          <a key={e.id} href="#" style={{
            background: "#fff", borderRadius: "10px", border: "1px solid #e5e9f0",
            padding: "13px 18px", display: "flex", alignItems: "center",
            justifyContent: "space-between", textDecoration: "none",
          }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#888" }}>
              Week {e.week_number}, {e.year}
            </span>
            <span style={{ fontSize: "13px", color: "#E83B2A", fontWeight: 700 }}>→</span>
          </a>
        )) : [1, 2, 3].map((i) => (
          <div key={i} style={{
            background: "#fff", borderRadius: "10px", border: "1px solid #e5e9f0",
            padding: "13px 18px", height: "46px",
          }} />
        ))}
      </div>
    </div>
  );
}

type GlobalArticleRow = {
  sort_order: number;
  subspecialty: string | null;
  articles: {
    id: string;
    title: string;
    pubmed_id: string | null;
    pubmed_indexed_at: string | null;
    article_type: string | null;
    journal_abbr: string | null;
  } | null;
};

function TopArticlesWidget({ articles }: { articles: GlobalArticleRow[] }) {
  const sorted = [...articles]
    .filter(r => r.articles)
    .sort((a, b) => {
      const da = a.articles?.pubmed_indexed_at ?? "";
      const db = b.articles?.pubmed_indexed_at ?? "";
      return db.localeCompare(da);
    });

  if (sorted.length === 0) return null;

  return (
    <div style={{
      background: "#fff",
      borderRadius: "12px",
      border: "1px solid #e5e9f0",
      padding: "20px",
      boxSizing: "border-box",
      height: "100%",
    }}>
      <div style={{
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "#E83B2A",
        borderBottom: "2px solid #E83B2A",
        paddingBottom: "8px",
      }}>
        Don&apos;t miss
      </div>
      <div style={{ fontSize: "11px", color: "#888", fontWeight: 400, marginTop: "3px", marginBottom: "14px" }}>
        Editor&apos;s picks · last 30 days
      </div>
      <div style={{
        maxHeight: "420px",
        overflowY: "auto",
        paddingRight: "4px",
      }}>
        {sorted.map((row, i) => {
          const a = row.articles!;
          const url = a.pubmed_id ? `https://pubmed.ncbi.nlm.nih.gov/${a.pubmed_id}/` : null;
          return (
            <div key={a.id} style={{
              paddingBottom: "12px",
              marginBottom: "12px",
              borderBottom: i < sorted.length - 1 ? "1px solid #f0f2f5" : "none",
            }}>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "5px" }}>
                {row.subspecialty && (
                  <span style={{
                    fontSize: "10px", fontWeight: 600, color: "#6b7280",
                    background: "#f3f4f6", borderRadius: "4px", padding: "2px 6px",
                  }}>
                    {row.subspecialty}
                  </span>
                )}
                {a.article_type && (
                  <span style={{
                    fontSize: "10px", fontWeight: 600, color: "#E83B2A",
                    background: "#fef2f2", borderRadius: "4px", padding: "2px 6px",
                  }}>
                    {a.article_type}
                  </span>
                )}
              </div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a", lineHeight: 1.45, marginBottom: "5px" }}>
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#1a1a1a", textDecoration: "none" }}>
                    {a.title}
                  </a>
                ) : a.title}
              </div>
              <div style={{ fontSize: "11px", color: "#aaa" }}>
                {[a.journal_abbr, a.pubmed_indexed_at ? new Date(a.pubmed_indexed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null]
                  .filter(Boolean).join(" · ")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ARTICLE_TYPE_ORDER = [
  "Meta-analysis", "Review", "Intervention study", "Non-interventional study",
  "Basic study", "Case", "Guideline", "Surgical Technique", "Tech",
  "Administration", "Letters & Notices",
];

function ArticleTypeMatrix({
  userSubs,
  shortNameMap,
  matrixRows,
}: {
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

  const ARTICLE_TYPE_DISPLAY: Record<string, string> = {
    "Non-interventional study": "Non-interventional",
    "Surgical Technique": "Surgical technique",
    "Case": "Case report",
  };

  return (
    <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e5e9f0", padding: "20px 24px", height: "100%" }}>
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
              <td style={{ fontSize: "12px", fontWeight: 500, color: "#555", padding: "6px 6px 6px 0", textAlign: "left" }}
                title={ARTICLE_TYPE_TOOLTIP[type]}>
                {ARTICLE_TYPE_DISPLAY[type] ?? type}
              </td>
              {userSubs.map(sub => {
                const n = lookup[sub]?.[type] ?? 0;
                return (
                  <td key={sub} style={{
                    fontSize: "12px", fontWeight: 500, textAlign: "center", padding: "6px",
                    color: n === 0 ? "#ddd" : "#444",
                    background: n === 0 ? "transparent" : "#fdf0ef",
                    borderRadius: "4px",
                  }}>
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
      padding: "6px 16px",
      fontSize: "12px",
      fontWeight: 600,
      color: previewVersion === "v2" ? "#991b1b" : "#92400e",
      textAlign: "center",
      letterSpacing: "0.03em",
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
  const currentWeekNumber = getWeekNum(startOfWeekIso);
  const currentYear = new Date().getFullYear();

  // 4 historiske uger (mandag-datoer)
  const weekStarts: string[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(monday);
    d.setDate(monday.getDate() - i * 7);
    weekStarts.push(d.toISOString().slice(0, 10));
  }

  const [{ data: profile }, { data: editionRaw }, { data: subsRows }, { data: weeklyCount }] = await Promise.all([
    supabase
      .from("users")
      .select("name, subspecialties")
      .eq("id", user.id)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("newsletter_editions")
      .select("id, week_number, year, content")
      .eq("status", "approved")
      .order("year", { ascending: false })
      .order("week_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("subspecialties")
      .select("name, short_name")
      .eq("specialty", ACTIVE_SPECIALTY)
      .eq("active", true),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc("count_articles_this_week", {
      week_start: startOfWeekIso,
      week_end: todayIso,
    }),
  ]);
  const edition = editionRaw as { id: string; week_number: number; year: number; content: NewsletterContent } | null;

  const firstName = profile?.name?.split(" ")[0] ?? "there";
  const userSubspecialties: string[] = Array.isArray(profile?.subspecialties)
    ? (profile.subspecialties as string[])
    : [];
  const shortNameMap: Record<string, string> = Object.fromEntries(
    ((subsRows ?? []) as { name: string; short_name: string | null }[])
      .map((r) => [r.name, r.short_name ?? r.name])
  );
  const userSubs = userSubspecialties.filter(s => s.toLowerCase() !== "neurosurgery");

  // Case A — no published edition yet
  if (!edition) {
    return (
      <>
        {previewBanner}
        <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 40px" }}>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a1a" }}>
            Welcome, {firstName}
          </div>
        </div>
      </>
    );
  }

  // Fetch global articles — last 30 days across all approved editions
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString().slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: globalRows } = await (supabase as any)
    .from("newsletter_edition_articles")
    .select("sort_order, subspecialty, article_id, edition_id")
    .eq("is_global", true)
    .in("edition_id",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (await (supabase as any)
        .from("newsletter_editions")
        .select("id")
        .eq("status", "approved")
        .gte("created_at", thirtyDaysAgoIso)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then((r: any) => (r.data ?? []).map((e: any) => e.id))
      )
    );

  let globalArticles: GlobalArticleRow[] = [];
  if (globalRows && globalRows.length > 0) {
    const articleIds = (globalRows as { article_id: string }[]).map(r => r.article_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: articleRows } = await (supabase as any)
      .from("articles")
      .select("id, title, pubmed_id, pubmed_indexed_at, article_type, journal_abbr")
      .in("id", articleIds);

    if (articleRows) {
      const articleMap = Object.fromEntries(
        (articleRows as NonNullable<GlobalArticleRow["articles"]>[]).map(a => [a.id, a])
      );
      globalArticles = (globalRows as { sort_order: number; subspecialty: string | null; article_id: string }[])
        .map(r => ({
          sort_order: r.sort_order,
          subspecialty: r.subspecialty,
          articles: articleMap[r.article_id] ?? null,
        }))
        .filter(r => r.articles !== null)
        .sort((a, b) => {
          const da = a.articles?.pubmed_indexed_at ?? "";
          const db = b.articles?.pubmed_indexed_at ?? "";
          return db.localeCompare(da);
        });
    }
  }

  // Fetch subspecialty counts for activity widget
  let subWeekCounts: { subspecialty: string; week_start: string; article_count: number }[] = [];
  if (userSubs.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).rpc("count_subspecialties_by_weeks", {
      p_subspecialties: userSubs,
      p_week_starts: weekStarts,
    });
    subWeekCounts = data ?? [];
  }

  const now2 = new Date();
  const firstOfMonth = new Date(now2.getFullYear(), now2.getMonth(), 1).toISOString().slice(0, 10);
  const firstOfYear  = new Date(now2.getFullYear(), 0, 1).toISOString().slice(0, 10);
  const todayIso2    = now2.toISOString().slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: monthlyCount }, { data: yearlyCount }] = await Promise.all([
    (supabase as any).rpc("count_articles_in_range", { p_from: firstOfMonth, p_to: todayIso2 }),
    (supabase as any).rpc("count_articles_in_range", { p_from: firstOfYear,  p_to: todayIso2 }),
  ]);

  let matrixRows: { subspecialty: string; article_type: string; article_count: number }[] = [];
  if (userSubs.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).rpc("get_article_type_matrix", {
      p_subspecialties: userSubs,
      p_from_date: thirtyDaysAgoIso,
    });
    matrixRows = data ?? [];
  }

  // Hent 3 tidligere approved editions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prevEditionsRaw } = await (supabase as any)
    .from("newsletter_editions")
    .select("id, week_number, year")
    .eq("status", "approved")
    .order("year", { ascending: false })
    .order("week_number", { ascending: false })
    .range(1, 4);

  const prevEditions = (prevEditionsRaw ?? []) as { id: string; week_number: number; year: number }[];

  // Case B — edition exists
  const content = edition.content as NewsletterContent;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Filter subspecialty sections to only those the user has selected
  const visibleSubspecialties = userSubspecialties.length > 0
    ? (content.subspecialties ?? []).filter((s) =>
        userSubspecialties.some((u) => u.toLowerCase() === s.name.toLowerCase())
      )
    : (content.subspecialties ?? []);

  const hasContent =
    (content.general?.length ?? 0) > 0 ||
    visibleSubspecialties.some((s) => s.articles.length > 0);

  return (
    <>
      {previewBanner}

      {/* Header — fri tekst */}
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 16px" }}>
        <div style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a1a" }}>{greeting}, {firstName}</div>
        <div style={{ fontSize: "13px", color: "#888", marginTop: "4px" }}>Week {currentWeekNumber}, {currentYear}</div>
      </div>

      {/* KPI banner — fuld bredde */}
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "0 24px 16px" }}>
        <ActivityWidget
          weeklyCount={weeklyCount ?? 0}
          monthlyCount={monthlyCount ?? 0}
          yearlyCount={yearlyCount ?? 0}
          weekStarts={weekStarts}
          userSubs={userSubs}
          subWeekCounts={subWeekCounts}
          shortNameMap={shortNameMap}
        />
      </div>

      {/* Midterste lag — article type matrix venstre, don't miss højre */}
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "0 24px 16px", display: "flex", gap: "24px", alignItems: "stretch" }}>
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          <ArticleTypeMatrix
            userSubs={userSubs}
            shortNameMap={shortNameMap}
            matrixRows={matrixRows}
          />
        </div>
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          <TopArticlesWidget articles={globalArticles} />
        </div>
      </div>

      {/* Newsletter — fuld bredde */}
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "0 24px 80px" }}>
        <NewsletterSection edition={{ ...edition, content: edition.content as { global_intro?: string } }} prevEditions={prevEditions} />
      </div>

      {/* Newsletter-artikler — smal container */}
      <div style={{ maxWidth: "620px", margin: "0 auto", padding: "0 24px 80px" }}>

        {/* General section first */}
        {(content.general?.length ?? 0) > 0 && (
          <div style={{ marginBottom: "32px", marginTop: "28px" }}>
            <SectionHeading>General</SectionHeading>
            {content.general.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        )}

        {/* Subspecialty sections matching user's selection */}
        {visibleSubspecialties
          .filter((s) => s.articles.length > 0)
          .map((s, i) => (
            <div key={s.name} style={{ marginBottom: "32px", marginTop: i === 0 && (content.general?.length ?? 0) === 0 ? "28px" : 0 }}>
              <SectionHeading>{s.name}</SectionHeading>
              {s.articles.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          ))}
      </div>
    </>
  );
}
