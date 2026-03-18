import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import ArticleTypeAdminClient from "./ArticleTypeAdminClient";

type Rule = {
  id: string;
  publication_type: string;
  article_type: string;
  is_active: boolean;
};

export default async function ArticleTypeSystemPage() {
  const admin = createAdminClient();

  const [pendingRes, deterministicRes, rulesRes] = await Promise.all([
    admin
      .from("articles")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved")
      .not("abstract", "is", null)
      .is("article_type_ai", null),

    admin
      .from("articles")
      .select("*", { count: "exact", head: true })
      .eq("article_type_method", "deterministic"),

    admin
      .from("article_type_rules")
      .select("*")
      .order("article_type", { ascending: true })
      .order("publication_type", { ascending: true }),
  ]);

  const pending       = pendingRes.count ?? 0;
  const deterministic = deterministicRes.count ?? 0;
  const rules         = (rulesRes.data ?? []) as Rule[];

  return (
    <div style={{ background: "#f5f7fa", minHeight: "100vh" }}>
      <div style={{
        fontFamily: "var(--font-inter), Inter, sans-serif",
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "40px 24px 0",
      }}>
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system/auto-tagging" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Auto-Tagging
          </Link>
        </div>
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Artikel Type</h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Deterministisk klassificering baseret på publication types
          </p>
        </div>
      </div>
      <ArticleTypeAdminClient
        pending={pending}
        deterministic={deterministic}
        initialRules={rules}
      />
    </div>
  );
}
