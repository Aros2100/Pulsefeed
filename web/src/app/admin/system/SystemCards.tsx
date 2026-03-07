"use client";

import Link from "next/link";
import { useState } from "react";

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

type ToastState = { msg: string; ok: boolean } | null;

export default function SystemCards({ hasAlerts }: { hasAlerts: boolean }) {
  const [busy,  setBusy]  = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  async function handleCleanup() {
    setBusy(true);
    setToast(null);
    try {
      const res = await fetch("/api/admin/cleanup-stuck-jobs", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setToast({ msg: data.error ?? "Noget gik galt", ok: false });
        return;
      }
      const total = (data.import_logs_fixed ?? 0) + (data.author_linking_logs_fixed ?? 0);
      if (total === 0) {
        setToast({ msg: "Ingen hængte jobs fundet", ok: true });
      } else {
        const parts: string[] = [];
        if (data.import_logs_fixed > 0)         parts.push(`${data.import_logs_fixed} import`);
        if (data.author_linking_logs_fixed > 0)  parts.push(`${data.author_linking_logs_fixed} author linking`);
        setToast({ msg: `Ryddede op i ${parts.join(" + ")} job${total > 1 ? "s" : ""}`, ok: true });
      }
    } catch {
      setToast({ msg: "Netværksfejl — prøv igen", ok: false });
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 5000);
    }
  }

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
        <Card href="/admin/system/import" emoji="📥" label="Import" sub="PubMed import-statistik" />
        <Card href="/admin/system/cost"   emoji="💰" label="Cost"   sub="AI API-forbrug" />
        <Card href="/admin/system/alerts" emoji="🔔" label="Alerts" sub="System-beskeder til brugere" badge={hasAlerts} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
        <button
          onClick={() => { void handleCleanup(); }}
          disabled={busy}
          style={{
            fontSize: "13px",
            fontWeight: 600,
            padding: "9px 20px",
            borderRadius: "8px",
            border: "1px solid #dde3ed",
            background: busy ? "#f1f5f9" : "#fff",
            color: busy ? "#94a3b8" : "#5a6a85",
            cursor: busy ? "not-allowed" : "pointer",
            boxShadow: SHADOW_DEFAULT,
            transition: "background 0.15s, color 0.15s",
          }}
        >
          {busy ? "Rydder op…" : "🧹 Ryd op i hængte jobs"}
        </button>

        {toast && (
          <div style={{
            fontSize: "13px",
            fontWeight: 500,
            padding: "8px 16px",
            borderRadius: "7px",
            background: toast.ok ? "#f0fdf4" : "#fef2f2",
            color:      toast.ok ? "#14532d" : "#991b1b",
            border:     `1px solid ${toast.ok ? "#bbf7d0" : "#fecaca"}`,
          }}>
            {toast.msg}
          </div>
        )}
      </div>
    </div>
  );
}
