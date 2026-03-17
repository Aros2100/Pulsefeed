import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";
import TaggingClient from "./TaggingClient";
import TaggingNav from "./TaggingNav";

export default async function TaggingPage() {
  const admin = createAdminClient();
  const activeSpecialties = SPECIALTIES.filter((s) => s.active).map((s) => s.slug);
  const specialty = activeSpecialties[0] ?? "neurosurgery";

  // Fetch all tagging rules
  const { data: rules } = await admin
    .from("tagging_rules" as never)
    .select("*" as never)
    .eq("specialty" as never, specialty as never)
    .order("total_decisions" as never, { ascending: false } as never);

  const typedRules = (rules ?? []) as {
    id: string;
    specialty: string;
    term: string;
    total_decisions: number;
    approved: number;
    rejected: number;
    approve_rate: number;
    source_count: number;
    min_decisions: number;
    status: "tracking" | "draft" | "active" | "disabled";
    activated_at: string | null;
  }[];

  // Fetch KPIs via RPC
  const { data: kpiData } = await admin.rpc("get_tagging_kpis" as never, {
    p_specialty: specialty,
  } as never);

  const kpis = (kpiData as { total_pending: number; no_mesh: number; single_ready: number; combo_ready: number; no_match: number } | null) ?? {
    total_pending: 0, no_mesh: 0, single_ready: 0, combo_ready: 0, no_match: 0,
  };

  // Fetch pending articles matching active single terms
  const { data: readyArticlesRaw } = await admin.rpc("get_single_ready_articles" as never, {
    p_specialty: specialty,
  } as never);

  const readyArticles = (readyArticlesRaw ?? []) as {
    article_id: string;
    title: string;
    journal_abbr: string | null;
    published_date: string | null;
    matched_terms: string[];
  }[];

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
            ← System
          </Link>
        </div>
        <TaggingNav />
      </div>
      <TaggingClient
        rules={typedRules}
        readyArticles={readyArticles}
        kpis={{
          totalPending: kpis.total_pending,
          noMesh: kpis.no_mesh,
          singleReady: kpis.single_ready,
          comboReady: kpis.combo_ready,
          noMatch: kpis.no_match,
        }}
        specialty={specialty}
      />
    </div>
  );
}
