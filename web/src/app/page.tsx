import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import KPIOverview from "@/components/KPIOverview";
import ArticleFilterPanel from "@/components/ArticleFilterPanel";
import { getRegion } from "@/lib/geo/continent-map";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
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
    "get_top_subspecialties",
    { p_limit: 3 },
  );
  const topSubspecialties = (topSubsData ?? []) as { tag: string; count: number }[];

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

      </div>
    </div>
  );

}
