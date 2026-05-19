import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computePairMatch,
  computeRankingCorrelation,
  getRankingsTableRows,
} from "@/lib/lab/value-scoring/evaluation";
import RankingsTable from "@/app/admin/(with-header)/lab/value-scoring/craft/evaluation/RankingsTable";

interface PageProps {
  params: Promise<{ id: string; promptId: string }>;
}

export default async function RankingsPage({ params }: PageProps) {
  const { id: directionId, promptId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const [{ data: direction }, { data: prompt }] = await Promise.all([
    admin.from("lab_value_directions").select("id, name").eq("id", directionId).maybeSingle(),
    admin.from("lab_value_prompts").select("id, version, module_id").eq("id", promptId).maybeSingle(),
  ]);

  if (!direction || !prompt) notFound();

  type Direction = { id: string; name: string };
  type Prompt    = { id: string; version: number; module_id: string };
  const dir = direction as Direction;
  const p   = prompt   as Prompt;

  const [rows, pairMatch, rankCorr] = await Promise.all([
    getRankingsTableRows(admin, p.id),
    computePairMatch(admin, p.id),
    computeRankingCorrelation(admin, p.id),
  ]);

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1060px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
          The Lab · Value Scoring · Craft ·{" "}
          <Link href={`/admin/lab/value-scoring/craft/direction/${directionId}`} style={{ color: "#E83B2A", textDecoration: "none" }}>
            {dir.name}
          </Link>
          {" "}· v{p.version} · Rankings
        </div>

        <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 28px" }}>
          {dir.name} v{p.version} · Rankings
        </h1>

        {/* Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
          <MetricCard
            title="Pair-match"
            value={`${pairMatch.matchPercent.toFixed(1)}%`}
            subtitle={`${pairMatch.matches} of ${pairMatch.totalPairs} pairs${pairMatch.ties > 0 ? ` · ${pairMatch.ties} ties` : ""}`}
            accent={pairMatch.matchPercent >= 75 ? "#059669" : pairMatch.matchPercent >= 60 ? "#92400e" : "#b91c1c"}
          />
          <MetricCard
            title="Rank correlation (Spearman ρ)"
            value={rankCorr.rho.toFixed(2)}
            subtitle={`BT ranking vs prompt score · n=${rankCorr.n}`}
            accent={rankCorr.rho >= 0.7 ? "#059669" : rankCorr.rho >= 0.4 ? "#92400e" : "#b91c1c"}
          />
        </div>

        {rows.length > 0 ? (
          <RankingsTable rows={rows} />
        ) : (
          <div style={{ background: "#fff8e1", border: "1px solid #fde68a", borderRadius: "8px", padding: "16px 20px", fontSize: "13px", color: "#92400e" }}>
            No ranking data available — ensure Bradley-Terry has been computed for this module.
          </div>
        )}

        <div style={{ marginTop: "20px" }}>
          <Link
            href={`/admin/lab/value-scoring/craft/evaluation?promptId=${promptId}`}
            style={{ fontSize: "12px", color: "#94a3b8", textDecoration: "none" }}
          >
            ← Back to evaluation
          </Link>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, subtitle, accent }: { title: string; value: string; subtitle: string; accent: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "20px 24px" }}>
      <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "8px" }}>
        {title}
      </div>
      <div style={{ fontSize: "32px", fontWeight: 700, color: accent, fontVariantNumeric: "tabular-nums", lineHeight: 1.1, marginBottom: "6px" }}>
        {value}
      </div>
      <div style={{ fontSize: "12px", color: "#5a6a85" }}>{subtitle}</div>
    </div>
  );
}
