"use client";

import Link from "next/link";

const SHADOW_DEFAULT = "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)";
const SHADOW_HOVER   = "0 4px 12px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)";

function Card({ href, emoji, label, sub, badge }: {
  href:   string;
  emoji:  string;
  label:  string;
  sub:    string;
  badge?: boolean;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div
        style={{
          position: "relative",
          background: "#fff",
          borderRadius: "12px",
          boxShadow: SHADOW_DEFAULT,
          padding: "40px 52px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
          cursor: "pointer",
          transition: "box-shadow 0.15s",
          minWidth: "220px",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.boxShadow = SHADOW_HOVER)}
        onMouseLeave={(e) => (e.currentTarget.style.boxShadow = SHADOW_DEFAULT)}
      >
        {badge && (
          <span style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "#E83B2A",
            display: "inline-block",
          }} />
        )}
        <span style={{ fontSize: "32px" }}>{emoji}</span>
        <span style={{ fontSize: "17px", fontWeight: 700, color: "#1a1a1a" }}>{label}</span>
        <span style={{ fontSize: "12px", color: "#888" }}>{sub}</span>
      </div>
    </Link>
  );
}

export default function SystemCards({ hasAlerts }: { hasAlerts: boolean }) {
  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#EEF2F7",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "32px",
    }}>
      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", justifyContent: "center" }}>
        <Card href="/admin/system/import"  emoji="📥" label="Import"  sub="PubMed import-statistik" />
        <Card href="/admin/system/tagging" emoji="🏷️" label="Auto-Tagging" sub="MeSH auto-tagging rules" />
        <Card href="/admin/system/alerts"  emoji="🔔" label="Alerts"  sub="System-beskeder til brugere" badge={hasAlerts} />
        <Card href="/admin/system/cost"    emoji="💰" label="Cost"    sub="AI API-forbrug" />
        <Card href="/admin/datarens"       emoji="🧹" label="Datarens" sub="Geo-validering og deduplicering" />
      </div>
    </div>
  );
}
