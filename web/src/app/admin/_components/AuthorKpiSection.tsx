import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { KpiTile, type TileColors } from "@/app/admin/_components/KpiTile";

const COLORS: TileColors = {
  background: "#EEEDFE",
  label:      "#534AB7",
  value:      "#3C3489",
};

type AuthorKpis = {
  total: number;
  last_30_days: number;
  last_7_days: number;
  last_night: number;
  last_night_date: string;
};

async function fetchKpis(): Promise<AuthorKpis> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const now = new Date();
  const since30  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since7   = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000).toISOString();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

  const [
    { count: total },
    { count: last30 },
    { count: last7 },
    { count: lastNight },
  ] = await Promise.all([
    admin.from("authors").select("id", { count: "exact", head: true }).is("deleted_at", null),
    admin.from("authors").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", since30),
    admin.from("authors").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", since7),
    admin.from("authors").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", todayUtc),
  ]);

  return {
    total:           total     ?? 0,
    last_30_days:    last30    ?? 0,
    last_7_days:     last7     ?? 0,
    last_night:      lastNight ?? 0,
    last_night_date: todayUtc.slice(0, 10),
  };
}

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

export async function AuthorKpiSection() {
  const k = await fetchKpis();
  return (
    <Link href="/admin/authors" aria-label="Authors" className="kpi-card" style={{
      display: "block", textDecoration: "none", color: "inherit",
      background: "#fff", borderRadius: "12px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.09)",
      padding: "14px",
    }}>
      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "15px", fontWeight: 500, color: COLORS.label }}>Authors</div>
        <div style={{ fontSize: "12px", color: "#5a6a85", marginTop: "2px" }}>Indexed researchers</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", marginBottom: "12px" }}>
        <KpiTile label="Total"        value={k.total.toLocaleString("en-US")}              sub="active" colors={COLORS} />
        <KpiTile label="Last 30 days" value={`+${k.last_30_days.toLocaleString("en-US")}`} sub="new"    colors={COLORS} />
        <KpiTile label="Last 7 days"  value={`+${k.last_7_days.toLocaleString("en-US")}`}  sub="new"    colors={COLORS} />
        <KpiTile label="Last night"   value={`+${k.last_night.toLocaleString("en-US")}`}   sub={formatDate(k.last_night_date)} colors={COLORS} />
      </div>
      <div style={{ textAlign: "right" }}>
        <span aria-hidden="true" style={{ fontSize: "18px", color: COLORS.label }}>→</span>
      </div>
    </Link>
  );
}
