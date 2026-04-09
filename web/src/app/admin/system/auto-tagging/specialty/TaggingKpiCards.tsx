"use client";

const SHADOW = "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)";

export interface TaggingKpis {
  totalPending: number;
  noMesh: number;
  singleReady: number;
  comboReady: number;
  noMatch: number;
}

function KpiCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: "10px",
      boxShadow: SHADOW,
      padding: "20px 28px",
      minWidth: "150px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: "28px", fontWeight: 700, color: accent ?? "#1a1a1a" }}>
        {value}
      </div>
      <div style={{ fontSize: "12px", color: "#5a6a85", marginTop: "4px" }}>{label}</div>
    </div>
  );
}

export default function TaggingKpiCards({ kpis }: { kpis: TaggingKpis }) {
  return (
    <div style={{ display: "flex", gap: "16px", marginBottom: "28px", flexWrap: "wrap" }}>
      <KpiCard label="Total pending" value={kpis.totalPending} />
      <KpiCard label="Ingen MeSH data" value={kpis.noMesh} />
      <KpiCard label="Ingen aktiv match" value={kpis.noMatch} />
      <KpiCard label="Single: Klar" value={kpis.singleReady} accent="#15803d" />
      <KpiCard label="Combo: Klar" value={kpis.comboReady} accent="#15803d" />
    </div>
  );
}
