import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/Header";
import ScoreBadge from "@/components/ScoreBadge";
import KPIOverview from "@/components/KPIOverview";
import ArticleFilterPanel from "@/components/ArticleFilterPanel";
import { getRegion } from "@/lib/geo/continent-map";

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
    .select("name, specialty_slugs, author_id, subspecialties, country")
    .eq("id", user.id)
    .single();

  const firstName = profile?.name?.split(" ")[0] ?? "there";
  const userSubspecialties = (profile?.subspecialties as string[] | null) ?? null;
  const userCountry = (profile?.country as string | null) ?? null;
  const userRegion = userCountry ? getRegion(userCountry) : null;

  // Fetch top subspecialties from DB
  const { data: topSubsData } = await supabase.rpc(
    "get_top_subspecialties" as never,
    { p_limit: 3 } as never,
  );
  const topSubspecialties = (topSubsData ?? []) as { tag: string; count: number }[];

  // Fetch publications if user has linked an author profile
  type ArticleRow = {
    id: string;
    title: string;
    journal_abbr: string | null;
    published_date: string | null;
    news_value: number | null;
    evidence_score: number | null;
  };
  type AuthorArticleRow = {
    position: number;
    articles: ArticleRow;
  };

  let myPublications: AuthorArticleRow[] = [];
  if (profile?.author_id) {
    const { data: pubData } = await supabase
      .from("article_authors")
      .select("position, articles(id, title, journal_abbr, published_date, news_value, evidence_score)")
      .eq("author_id", profile.author_id)
      .order("position", { ascending: true })
      .limit(10);

    if (pubData) {
      myPublications = (pubData as unknown as AuthorArticleRow[]).sort((a, b) => {
        const da = a.articles.published_date ?? "";
        const db = b.articles.published_date ?? "";
        return db.localeCompare(da);
      });
    }
  }

  const quickLinks = [
    { icon: "✉️", title: "Newsletters",    desc: "View your previous digests",       href: "/newsletters" },
    { icon: "🔍", title: "Search",         desc: "Search across all articles",       href: "/search" },
    { icon: "🌍", title: "Explore",        desc: "Geo distribution of articles",     href: "/geo" },
    { icon: "🔖", title: "Saved",          desc: "Articles you bookmarked",          href: "/saved" },
    { icon: "📖", title: "History",        desc: "Recently read articles",           href: "/history" },
    { icon: "👤", title: "Authors",        desc: "Browse and follow researchers",    href: "/authors" },
    { icon: "👥", title: "Following",      desc: "Authors you follow",               href: "/following" },
    { icon: "⚙️", title: "My Profile",    desc: "Account and preferences",          href: "/profile" },
  ];

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <Header />

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Greeting */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "26px", fontWeight: 700 }}>{greeting()}, {firstName}</div>
        </div>

        {/* KPI Overview */}
        <KPIOverview userSubspecialties={userSubspecialties} />

        {/* Article Filter Panel */}
        <div style={{ marginTop: "28px" }}>
          <ArticleFilterPanel
            userSubspecialties={userSubspecialties}
            topSubspecialties={topSubspecialties}
            userRegion={userRegion}
          />
        </div>

        {/* Quick access */}
        <div style={{
          fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85",
          textTransform: "uppercase", fontWeight: 700, marginBottom: "12px", marginTop: "28px",
        }}>
          Quick access
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
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

        {/* My Publications */}
        {profile?.author_id && (
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
                    <div style={{ marginLeft: "16px", flexShrink: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                      {row.articles.evidence_score != null && <ScoreBadge score={row.articles.evidence_score} />}
                      <StarRating value={row.articles.news_value} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );

}
