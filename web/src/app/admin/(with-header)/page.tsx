import Link from "next/link";
import { ArticleKpiSection } from "@/app/admin/_components/ArticleKpiSection";
import { UserKpiSection } from "@/app/admin/_components/UserKpiSection";
import { AuthorKpiSection } from "@/app/admin/_components/AuthorKpiSection";
import { NewsletterCard } from "@/app/admin/_components/NewsletterCard";
import { ImportStatusSection } from "@/app/admin/_components/ImportStatusSection";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

function getThisWeekRange(): { start: string; end: string } {
  const today = new Date();
  const day = today.getDay() || 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - day + 1);
  return {
    start: monday.toISOString().slice(0, 10),
    end: today.toISOString().slice(0, 10),
  };
}

export default async function AdminDashboard() {
  const { start, end } = getThisWeekRange();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: countResult, error: rpcError } = await admin.rpc("count_newsletter_articles", {
    p_specialty: ACTIVE_SPECIALTY,
    p_start: start,
    p_end: end,
  });
  if (rpcError) console.error("[newsletter widget] count_newsletter_articles error:", rpcError.message, { start, end, specialty: ACTIVE_SPECIALTY });
  const articleCount: number = Number(countResult ?? 0);

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      {/* Hover effect for the three section cards */}
      <style>{`.kpi-card:hover { box-shadow: 0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.22) !important; }`}</style>

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Articles · Authors · Subscribers — three color-coded clickable cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "16px", marginBottom: "20px" }}>
          <ArticleKpiSection />
          <AuthorKpiSection />
          <UserKpiSection />
        </div>

        {/* Newsletter + Import status */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
          <NewsletterCard articleCount={articleCount} />
          <ImportStatusSection />
        </div>

        {/* The Lab + System */}
        <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "12px" }}>
          Quick access
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <Link href="/admin/lab" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "20px 24px", textDecoration: "none", color: "#1a1a1a" }}>
            <div style={{ fontSize: "22px", marginBottom: "12px" }}>🧪</div>
            <div style={{ fontSize: "14px", fontWeight: 700 }}>The Lab</div>
            <div style={{ fontSize: "12px", color: "#888", marginTop: "4px", lineHeight: 1.4 }}>Train and improve the AI models</div>
          </Link>
          <Link href="/admin/system" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "20px 24px", textDecoration: "none", color: "#1a1a1a" }}>
            <div style={{ fontSize: "22px", marginBottom: "12px" }}>⚙️</div>
            <div style={{ fontSize: "14px", fontWeight: 700 }}>System</div>
            <div style={{ fontSize: "12px", color: "#888", marginTop: "4px", lineHeight: 1.4 }}>Import configuration and logs</div>
          </Link>
        </div>

      </div>
    </div>
  );
}
