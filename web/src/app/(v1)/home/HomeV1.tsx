import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { NewsletterArticle, NewsletterContent } from "@/lib/newsletter/send";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";


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
  weekStarts,
  userSubs,
  subWeekCounts,
  currentWeekNumber,
  currentYear,
}: {
  weeklyCount: number;
  weekStarts: string[];
  userSubs: string[];
  subWeekCounts: { subspecialty: string; week_start: string; article_count: number }[];
  currentWeekNumber: number;
  currentYear: number;
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
    <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e5e9f0", padding: "20px 24px" }}>

      {/* Hero: text left, big number right */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", paddingBottom: "16px", borderBottom: "1px solid #f0f2f5", marginBottom: "16px" }}>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a", lineHeight: 1.4, marginBottom: "4px" }}>
            New articles in <span style={{ color: "#E83B2A" }}>neurosurgery</span><br />this week
          </div>
          <div style={{ fontSize: "11px", color: "#bbb" }}>Week {currentWeekNumber}, {currentYear}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: "52px", fontWeight: 800, color: "#1a1a1a", lineHeight: 1 }}>{weeklyCount}</div>
          <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#E83B2A", marginTop: "2px" }}>so far</div>
        </div>
      </div>

      {/* Subspecialty rows */}
      {userSubs.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#bbb" }}>
              Your subspecialties
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              {weekStarts.map((ws, i) => (
                <div key={ws} style={{ width: "36px", textAlign: "center", fontSize: "9px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: i === weekStarts.length - 1 ? "#E83B2A" : "#ccc" }}>
                  W{getWeekNum(ws)}
                </div>
              ))}
            </div>
          </div>

          {userSubs.map((sub) => {
            const counts = weekStarts.map(ws => lookup[sub]?.[ws] ?? 0);
            const max = Math.max(...counts, 1);
            return (
              <div key={sub} style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                <div style={{ flex: "1 1 0", fontSize: "12px", fontWeight: 600, color: "#444", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {sub}
                </div>
                <div style={{ display: "flex", gap: "6px", alignItems: "flex-end", flexShrink: 0 }}>
                  {counts.map((count, i) => {
                    const isCurrent = i === counts.length - 1;
                    const heightPct = Math.round((count / max) * 100);
                    return (
                      <div key={i} style={{ width: "36px", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                        <div style={{ width: "100%", height: "24px", display: "flex", alignItems: "flex-end" }}>
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
        </>
      )}
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
      width: "50%",
      minWidth: "280px",
      background: "#fff",
      borderRadius: "12px",
      border: "1px solid #e5e9f0",
      padding: "20px",
      boxSizing: "border-box",
    }}>
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
        This month&apos;s highlights
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

  // 4 historiske uger (mandag-datoer)
  const weekStarts: string[] = [];
  for (let i = 3; i >= 0; i--) {
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

  // Fetch global articles — two separate queries to avoid PostgREST nested relation issues
  let globalArticles: GlobalArticleRow[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: editionArticleRows } = await (supabase as any)
    .from("newsletter_edition_articles")
    .select("sort_order, subspecialty, article_id")
    .eq("edition_id", edition.id)
    .eq("is_global", true);

  if (editionArticleRows && editionArticleRows.length > 0) {
    const articleIds = (editionArticleRows as { article_id: string }[]).map((r) => r.article_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: articleRows } = await (supabase as any)
      .from("articles")
      .select("id, title, pubmed_id, pubmed_indexed_at, article_type, journal_abbr")
      .in("id", articleIds);

    if (articleRows) {
      const articleMap = Object.fromEntries(
        (articleRows as NonNullable<GlobalArticleRow["articles"]>[]).map((a) => [a.id, a])
      );
      globalArticles = (editionArticleRows as { sort_order: number; subspecialty: string | null; article_id: string }[])
        .map((r) => ({
          sort_order: r.sort_order,
          subspecialty: r.subspecialty,
          articles: articleMap[r.article_id] ?? null,
        }))
        .filter((r) => r.articles !== null)
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

      {/* Header + widget — two-column layout */}
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 0", display: "flex", alignItems: "flex-start", gap: "32px" }}>
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          {/* Header — ingen baggrund */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a1a" }}>
              Welcome back, {firstName}
            </div>
            <div style={{ fontSize: "13px", color: "#888", marginTop: "4px" }}>
              Week {edition.week_number}, {edition.year}
            </div>
          </div>

          <ActivityWidget
            weeklyCount={weeklyCount ?? 0}
            weekStarts={weekStarts}
            userSubs={userSubs}
            subWeekCounts={subWeekCounts}
            currentWeekNumber={edition.week_number}
            currentYear={edition.year}
          />
        </div>
        <div style={{ flex: "0 0 420px" }}>
          <TopArticlesWidget articles={globalArticles} />
        </div>
      </div>

      {/* Newsletter-sektion — bred container */}
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "24px 24px 0" }}>
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
