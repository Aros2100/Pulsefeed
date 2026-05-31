import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { KpiTile, type TileColors } from "@/app/admin/_components/KpiTile";

const COLORS: TileColors = {
  background: "#FAECE7",
  label:      "#993C1D",
  value:      "#712B13",
};

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

export async function UserKpiSection() {
  const k = await fetchKpis();
  return (
    <Link href="/admin/subscribers" aria-label="Subscribers" className="kpi-card" style={{
      display: "block", textDecoration: "none", color: "inherit",
      background: "#fff", borderRadius: "12px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.09)",
      padding: "14px",
    }}>
      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "15px", fontWeight: 500, color: COLORS.label }}>Subscribers</div>
        <div style={{ fontSize: "12px", color: "#5a6a85", marginTop: "2px" }}>Active users</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", marginBottom: "12px" }}>
        <KpiTile label="Total"        value={k.total_active.toLocaleString("en-US")}       sub="active"  colors={COLORS} />
        <KpiTile label="Last 30 days" value={`+${k.signups_30d.toLocaleString("en-US")}`}  sub="signups" colors={COLORS} />
        <KpiTile label="Last 7 days"  value={`+${k.signups_7d.toLocaleString("en-US")}`}   sub="signups" colors={COLORS} />
        <KpiTile label="Last 24h"     value={`+${k.signups_24h.toLocaleString("en-US")}`}  sub="signups" colors={COLORS} />
      </div>
      <div style={{ textAlign: "right" }}>
        <span aria-hidden="true" style={{ fontSize: "18px", color: COLORS.label }}>→</span>
      </div>
    </Link>
  );
}
