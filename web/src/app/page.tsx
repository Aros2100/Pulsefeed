import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SPECIALTIES } from "@/lib/auth/specialties";
import Header from "@/components/Header";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function StarRating({ value }: { value: number | null }) {
  if (value === null) return <span style={{ color: "#aaa" }}>—</span>;
  const stars = Math.round(value);
  return (
    <span style={{ color: "#f0a500", letterSpacing: "1px" }}>
      {"★".repeat(stars)}{"☆".repeat(5 - stars)}
    </span>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("name, specialty_slugs, author_id")
    .eq("id", user.id)
    .single();

  const firstName = profile?.name?.split(" ")[0] ?? "there";
  const specialtySlugs: string[] = profile?.specialty_slugs ?? [];
  const specialtyLabel = specialtySlugs
    .map((s) => SPECIALTIES.find((sp) => sp.slug === s)?.label)
    .filter(Boolean)
    .join(", ") || "all specialties";

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // All metrics default to 0 when no specialty is configured
  let thisWeekCount = 0;
  let lastWeekCount = 0;
  let aiCount = 0;
  let practiceCount = 0;
  let lastWeekPracticeCount = 0;
  let avgNewsValue: string | null = null;

  if (specialtySlugs.length > 0) {
    const [
      { count: thisWeek },
      { count: lastWeek },
      { count: aiEnriched },
      { count: practiceChanging },
      { count: lastWeekPractice },
      { data: newsValueRows },
    ] = await Promise.all([
      supabase.from("articles").select("*", { count: "exact", head: true }).eq("verified", true).contains("specialty_tags", specialtySlugs).gte("imported_at", weekAgo),
      supabase.from("articles").select("*", { count: "exact", head: true }).eq("verified", true).contains("specialty_tags", specialtySlugs).gte("imported_at", twoWeeksAgo).lt("imported_at", weekAgo),
      supabase.from("articles").select("*", { count: "exact", head: true }).eq("verified", true).contains("specialty_tags", specialtySlugs).gte("imported_at", weekAgo).not("enriched_at", "is", null),
      supabase.from("articles").select("*", { count: "exact", head: true }).eq("verified", true).contains("specialty_tags", specialtySlugs).gte("imported_at", weekAgo).ilike("clinical_relevance", "%practice%"),
      supabase.from("articles").select("*", { count: "exact", head: true }).eq("verified", true).contains("specialty_tags", specialtySlugs).gte("imported_at", twoWeeksAgo).lt("imported_at", weekAgo).ilike("clinical_relevance", "%practice%"),
      supabase.from("articles").select("news_value").eq("verified", true).contains("specialty_tags", specialtySlugs).gte("imported_at", weekAgo).not("news_value", "is", null),
    ]);

    thisWeekCount = thisWeek ?? 0;
    lastWeekCount = lastWeek ?? 0;
    aiCount = aiEnriched ?? 0;
    practiceCount = practiceChanging ?? 0;
    lastWeekPracticeCount = lastWeekPractice ?? 0;

    if (newsValueRows && newsValueRows.length > 0) {
      avgNewsValue = (
        newsValueRows.reduce((sum: number, r: { news_value: number | null }) => sum + (r.news_value ?? 0), 0) /
        newsValueRows.length
      ).toFixed(1);
    }
  }

  const thisWeekDelta = thisWeekCount - lastWeekCount;
  const practiceDelta = practiceCount - lastWeekPracticeCount;

  // Fetch publications if user has linked an author profile
  type ArticleRow = {
    id: string;
    title: string;
    journal_abbr: string | null;
    published_date: string | null;
    news_value: number | null;
  };
  type AuthorArticleRow = {
    position: number;
    articles: ArticleRow;
  };

  let myPublications: AuthorArticleRow[] = [];
  if (profile?.author_id) {
    const { data: pubData } = await supabase
      .from("article_authors")
      .select("position, articles(id, title, journal_abbr, published_date, news_value)")
      .eq("author_id", profile.author_id)
      .order("position", { ascending: true })
      .limit(10);

    if (pubData) {
      myPublications = (pubData as AuthorArticleRow[]).sort((a, b) => {
        const da = a.articles.published_date ?? "";
        const db = b.articles.published_date ?? "";
        return db.localeCompare(da);
      });
    }
  }

  const kpis = [
    {
      value: String(thisWeekCount),
      color: "#E83B2A" as string | undefined,
      label: "New articles",
      delta: `${thisWeekDelta >= 0 ? "↑" : "↓"} ${Math.abs(thisWeekDelta)} vs last week`,
      deltaColor: thisWeekDelta >= 0 ? "#2d7a2d" : "#E83B2A",
    },
    {
      value: String(aiCount),
      color: undefined,
      label: "AI enriched",
      delta: `of ${thisWeekCount} new`,
      deltaColor: "#aaa",
    },
    {
      value: String(practiceCount),
      color: "#2d7a2d" as string | undefined,
      label: "Practice changing",
      delta: `${practiceDelta >= 0 ? "↑" : "↓"} ${Math.abs(practiceDelta)} vs last week`,
      deltaColor: practiceDelta >= 0 ? "#2d7a2d" : "#E83B2A",
    },
    {
      value: avgNewsValue ?? "—",
      color: undefined,
      label: "Avg. news value",
      delta: "out of 5",
      deltaColor: "#aaa",
    },
    {
      value: "—",
      color: undefined,
      label: "Last newsletter",
      delta: "Not yet sent",
      deltaColor: "#aaa",
    },
  ];

  const quickLinks = [
    { icon: "✉️", title: "Newsletters", desc: "View your previous digests", href: "/newsletters" },
    { icon: "🔍", title: "Keyword search", desc: "Search across all articles", href: "/search" },
    { icon: "👤", title: "Authors", desc: "Browse and follow researchers", href: "/authors" },
    { icon: "📑", title: "My Publications", desc: "Your indexed articles", href: "#publications" },
  ];

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <Header />

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Greeting */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "26px", fontWeight: 700 }}>{greeting()}, {firstName}</div>
          <div style={{ fontSize: "14px", color: "#888", marginTop: "4px" }}>
            Showing content for <strong style={{ color: "#1a1a1a" }}>{specialtyLabel}</strong>
          </div>
        </div>

        {/* KPI card */}
        <div style={{
          background: "#fff",
          borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          overflow: "hidden",
          marginBottom: "12px",
        }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
            <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
              This week · {specialtyLabel}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)" }}>
            {kpis.map((kpi, i) => (
              <div key={i} style={{ padding: "20px 24px", borderRight: i < 4 ? "1px solid #f0f0f0" : undefined }}>
                <div style={{ fontSize: "28px", fontWeight: 700, lineHeight: 1, color: kpi.color ?? "#1a1a1a" }}>
                  {kpi.value}
                </div>
                <div style={{ fontSize: "12px", color: "#888", marginTop: "6px" }}>{kpi.label}</div>
                <div style={{ fontSize: "11px", marginTop: "4px", color: kpi.deltaColor }}>{kpi.delta}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick access */}
        <div style={{
          fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85",
          textTransform: "uppercase", fontWeight: 700, marginBottom: "12px", marginTop: "28px",
        }}>
          Quick access
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
          {quickLinks.map((btn) => (
            <Link
              key={btn.title}
              href={btn.href}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                background: "#fff",
                borderRadius: "10px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
                padding: "20px 24px",
                textDecoration: "none",
                color: "#1a1a1a",
              }}
            >
              <div style={{ fontSize: "22px", marginBottom: "12px" }}>{btn.icon}</div>
              <div style={{ fontSize: "14px", fontWeight: 700 }}>{btn.title}</div>
              <div style={{ fontSize: "12px", color: "#888", marginTop: "4px", lineHeight: 1.4 }}>{btn.desc}</div>
            </Link>
          ))}
        </div>

        {/* My Publications or link-author prompt */}
        {profile?.author_id ? (
          <div id="publications" style={{ marginTop: "28px" }}>
            <div style={{
              fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85",
              textTransform: "uppercase", fontWeight: 700, marginBottom: "12px",
            }}>
              My Publications
            </div>
            <div style={{
              background: "#fff",
              borderRadius: "10px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
              overflow: "hidden",
            }}>
              <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
                <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
                  Your indexed articles
                </div>
              </div>
              {myPublications.length === 0 ? (
                <div style={{ padding: "24px", fontSize: "14px", color: "#888" }}>
                  No publications found for your linked author profile.
                </div>
              ) : (
                myPublications.map((row, i) => (
                  <div
                    key={row.articles.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "14px 24px",
                      borderTop: i === 0 ? undefined : "1px solid #f0f0f0",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Link
                        href={`/articles/${row.articles.id}`}
                        style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a", textDecoration: "none" }}
                      >
                        {row.articles.title}
                      </Link>
                      <div style={{ fontSize: "12px", color: "#888", marginTop: "3px" }}>
                        {[row.articles.journal_abbr, row.articles.published_date?.slice(0, 7)].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div style={{ marginLeft: "16px", flexShrink: 0 }}>
                      <StarRating value={row.articles.news_value} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div id="publications" style={{ marginTop: "20px" }}>
            <div style={{
              border: "1.5px dashed #c7d2e0",
              borderRadius: "10px",
              padding: "14px 20px",
              background: "#fafbfd",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div style={{ fontSize: "13px", color: "#5a6a85" }}>
                Are you a published author?
              </div>
              <Link
                href="/profile/link-author"
                style={{ fontSize: "13px", color: "#4f46e5", fontWeight: 600, textDecoration: "none" }}
              >
                Link your profile →
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
