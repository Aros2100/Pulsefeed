import { createAdminClient } from "@/lib/supabase/admin";

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

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{
      background: "#EFF6FF",
      border: "1px solid #BFDBFE",
      borderRadius: "10px",
      padding: "16px",
      minWidth: 0,
    }}>
      <div style={{ fontSize: "11px", fontWeight: 600, color: "#1E40AF", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: "6px" }}>
        {label}
      </div>
      <div style={{ fontSize: "22px", fontWeight: 700, color: "#1E3A8A", lineHeight: 1.1, marginBottom: "4px" }}>
        {value}
      </div>
      <div style={{ fontSize: "11px", color: "#3B82F6", opacity: 0.85 }}>
        {sub}
      </div>
    </div>
  );
}

export async function ArticleKpiSection() {
  const k = await fetchKpis();
  return (
    <div style={{ marginBottom: "28px" }}>
      <div style={{ marginBottom: "10px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#1a1a1a", marginBottom: "2px" }}>
          Articles in specialty
        </div>
        <div style={{ fontSize: "11px", color: "#5a6a85" }}>
          Neurosurgery · in-specialty articles only
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
        <Tile label="Total"        value={k.total.toLocaleString("en-US")}              sub="all-time" />
        <Tile label="Last 30 days" value={`+${k.last_30_days.toLocaleString("en-US")}`} sub={`avg ${k.avg_per_night_30d}/night`} />
        <Tile label="Last 7 days"  value={`+${k.last_7_days.toLocaleString("en-US")}`}  sub={`avg ${k.avg_per_night_7d}/night`} />
        <Tile label="Last night"   value={`+${k.last_night.toLocaleString("en-US")}`}   sub={formatDate(k.last_night_date)} />
      </div>
    </div>
  );
}
