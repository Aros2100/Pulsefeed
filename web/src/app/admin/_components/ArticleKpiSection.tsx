import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { KpiTile, type TileColors } from "@/app/admin/_components/KpiTile";

const COLORS: TileColors = {
  background: "#E1F5EE",
  label:      "#0F6E56",
  value:      "#085041",
};

type ArticleKpis = {
  total: number;
  last_30_days: number;
  last_7_days: number;
  last_night: number;
  last_night_date: string;
  avg_per_night_30d: number;
  avg_per_night_7d: number;
};

async function fetchKpis(): Promise<ArticleKpis> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin.rpc("get_article_kpis");
  if (error) throw new Error(`Article KPIs failed: ${error.message}`);
  return data as ArticleKpis;
}

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

export async function ArticleKpiSection() {
  const k = await fetchKpis();
  return (
    <Link href="/admin/articles" aria-label="Articles" className="kpi-card" style={{
      display: "block", textDecoration: "none", color: "inherit",
      background: "#fff", borderRadius: "12px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.09)",
      padding: "14px",
    }}>
      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "15px", fontWeight: 500, color: COLORS.label }}>Articles</div>
        <div style={{ fontSize: "12px", color: "#5a6a85", marginTop: "2px" }}>In-specialty only</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", marginBottom: "12px" }}>
        <KpiTile label="Total"        value={k.total.toLocaleString("en-US")}              sub="all-time"                           colors={COLORS} />
        <KpiTile label="Last 30 days" value={`+${k.last_30_days.toLocaleString("en-US")}`} sub={`avg ${k.avg_per_night_30d}/night`}  colors={COLORS} />
        <KpiTile label="Last 7 days"  value={`+${k.last_7_days.toLocaleString("en-US")}`}  sub={`avg ${k.avg_per_night_7d}/night`}   colors={COLORS} />
        <KpiTile label="Last night"   value={`+${k.last_night.toLocaleString("en-US")}`}   sub={formatDate(k.last_night_date)}       colors={COLORS} />
      </div>
      <div style={{ textAlign: "right" }}>
        <span aria-hidden="true" style={{ fontSize: "18px", color: COLORS.label }}>→</span>
      </div>
    </Link>
  );
}
