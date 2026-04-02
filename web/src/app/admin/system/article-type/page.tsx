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

  const [pendingRes, deterministicRes, rulesRes, pendingApprovalRes, pendingApprovalCountRes, behandletRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).rpc("count_article_type_pending"),

    admin
      .from("articles")
      .select("*", { count: "exact", head: true })
      .eq("article_type_method", "deterministic"),

    admin
      .from("article_type_rules")
      .select("*")
      .order("article_type", { ascending: true })
      .order("publication_type", { ascending: true }),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).rpc("get_article_type_pending_approval"),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).rpc("count_article_type_pending_approval"),

    admin
      .from("articles")
      .select("*", { count: "exact", head: true })
      .eq("article_type_validated", true),
  ]);

  const pending              = (pendingRes.data as number) ?? 0;
  const deterministic        = deterministicRes.count ?? 0;
  const rules                = (rulesRes.data ?? []) as Rule[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingApproval      = (pendingApprovalRes.data ?? []) as any[];
  const pendingApprovalCount = (pendingApprovalCountRes.data as number) ?? 0;
  const behandlet            = behandletRes.count ?? 0;

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
        pendingApproval={pendingApproval}
        pendingApprovalCount={pendingApprovalCount}
        behandlet={behandlet}
      />
    </div>
  );
}
