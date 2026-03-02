import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Header from "@/components/Header";
import AdminArticleListClient from "./AdminArticleListClient";

export default async function AdminArticlesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await supabase
    .from("users")
    .select("role_type")
    .eq("id", user.id)
    .single();

  if (profile.data?.role_type !== "admin") redirect("/articles");

  const admin = createAdminClient();
  const { data: articles } = await admin
    .from("articles")
    .select("id, title, journal_abbr, published_date, authors, status, circle, specialty_tags, imported_at, enriched_at, ai_decision")
    .order("imported_at", { ascending: false })
    .limit(300);

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", minHeight: "100vh" }}>
      <Header />
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "40px 24px 80px" }}>

        <div style={{ marginBottom: "8px", fontSize: "13px", color: "#5a6a85" }}>
          <Link href="/admin/system" style={{ color: "#5a6a85", textDecoration: "none" }}>← System</Link>
        </div>
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            Admin · Artikler
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Artikliste</h1>
        </div>

        <AdminArticleListClient articles={articles ?? []} />
      </div>
    </div>
  );
}
