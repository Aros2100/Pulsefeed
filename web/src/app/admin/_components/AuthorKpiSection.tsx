import { createAdminClient } from "@/lib/supabase/admin";

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
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since7  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000).toISOString();
  // Last night = start of current UTC day (same window as article "LAST NIGHT" tile)
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

export async function AuthorKpiSection() {
  const k = await fetchKpis();
  return (
    <div style={{ marginBottom: "28px" }}>
      <div style={{ marginBottom: "10px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#1a1a1a", marginBottom: "2px" }}>
          Authors
        </div>
        <div style={{ fontSize: "11px", color: "#5a6a85" }}>
          Indexed researchers
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
        <Tile label="Total"        value={k.total.toLocaleString("en-US")}              sub="active" />
        <Tile label="Last 30 days" value={`+${k.last_30_days.toLocaleString("en-US")}`} sub="new" />
        <Tile label="Last 7 days"  value={`+${k.last_7_days.toLocaleString("en-US")}`}  sub="new" />
        <Tile label="Last night"   value={`+${k.last_night.toLocaleString("en-US")}`}   sub={formatDate(k.last_night_date)} />
      </div>
    </div>
  );
}
