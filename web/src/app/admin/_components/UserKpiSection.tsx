import { createAdminClient } from "@/lib/supabase/admin";

type UserKpis = {
  total_active: number;
  signups_30d: number;
  signups_7d: number;
  signups_24h: number;
};

async function fetchKpis(): Promise<UserKpis> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin.rpc("get_user_kpis");
  if (error) throw new Error(`User KPIs failed: ${error.message}`);
  return data as UserKpis;
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

export async function UserKpiSection() {
  const k = await fetchKpis();
  return (
    <div style={{ marginBottom: "28px" }}>
      <div style={{ marginBottom: "10px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#1a1a1a", marginBottom: "2px" }}>
          Users
        </div>
        <div style={{ fontSize: "11px", color: "#5a6a85" }}>
          Active subscribers
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
        <Tile label="Total"        value={k.total_active.toLocaleString("en-US")}       sub="active" />
        <Tile label="Last 30 days" value={`+${k.signups_30d.toLocaleString("en-US")}`} sub="signups" />
        <Tile label="Last 7 days"  value={`+${k.signups_7d.toLocaleString("en-US")}`}  sub="signups" />
        <Tile label="Last 24h"     value={`+${k.signups_24h.toLocaleString("en-US")}`} sub="signups" />
      </div>
    </div>
  );
}
