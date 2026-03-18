import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPECIALTIES } from "@/lib/auth/specialties";
import TaggingNav from "../TaggingNav";
import CombosClient from "./CombosClient";

export default async function CombosPage() {
  const admin = createAdminClient();
  const activeSpecialties = SPECIALTIES.filter((s) => s.active).map((s) => s.slug);
  const specialty = activeSpecialties[0] ?? "neurosurgery";

  // Fetch combo rules
  const { data: rules } = await admin
    .from("tagging_rule_combos")
    .select("*")
    .eq("specialty", specialty)
    .order("total_decisions", { ascending: false });

  type RawRule = {
    id: string;
    specialty: string;
    term_1: string;
    term_2: string;
    total_decisions: number;
    approved: number;
    rejected: number;
    approve_rate: number;
    source_count: number;
    min_decisions: number;
    status: "tracking" | "draft" | "active" | "disabled";
    activated_at: string | null;
  };

  const typedRules = (rules ?? []) as RawRule[];

  // Fetch co-occurrences (for heatmap)
  const { data: coOccurrences } = await admin.rpc("get_mesh_co_occurrences", {
    p_specialty: specialty,
    p_min_count: 3,
  });

  const typedCoOccurrences = (coOccurrences ?? []) as {
    term_1: string;
    term_2: string;
    pair_count: number;
  }[];

  // Fetch article counts per combo rule
  const { data: articleCounts } = await admin.rpc("get_combo_article_counts", {
    p_specialty: specialty,
  });

  const typedCounts = (articleCounts ?? []) as {
    term_1: string;
    term_2: string;
    co_occurrences: number;
    pending_count: number;
  }[];

  // Merge counts into rules
  const countsMap = new Map(
    typedCounts.map((c) => [`${c.term_1}|||${c.term_2}`, c])
  );

  const rulesWithCounts = typedRules.map((r) => {
    const counts = countsMap.get(`${r.term_1}|||${r.term_2}`);
    return {
      ...r,
      co_occurrences: counts?.co_occurrences ?? 0,
      pending_count: counts?.pending_count ?? 0,
    };
  });

  // Fetch pending articles matching active combos
  const { data: pendingArticles } = await admin.rpc("get_combo_pending_articles", {
    p_specialty: specialty,
  });

  const typedPending = (pendingArticles ?? []) as unknown as {
    article_id: string;
    title: string;
    journal_abbr: string | null;
    published_date: string | null;
    matched_combos: { term_1: string; term_2: string }[];
  }[];

  // Fetch KPIs via RPC
  const { data: kpiData } = await admin.rpc("get_tagging_kpis", {
    p_specialty: specialty,
  });

  const kpis = (kpiData as { total_pending: number; no_mesh: number; single_ready: number; combo_ready: number; no_match: number } | null) ?? {
    total_pending: 0, no_mesh: 0, single_ready: 0, combo_ready: 0, no_match: 0,
  };

  return (
    <div style={{ background: "#f5f7fa", minHeight: "100vh" }}>
      <div style={{
        fontFamily: "var(--font-inter), Inter, sans-serif",
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "40px 24px 0",
      }}>
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← System
          </Link>
        </div>
        <TaggingNav />
      </div>
      <CombosClient
        rules={rulesWithCounts}
        coOccurrences={typedCoOccurrences}
        pendingArticles={typedPending}
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
