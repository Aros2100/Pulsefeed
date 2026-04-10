"use client";

import { useState, useEffect } from "react";

function getNextRun03UTC(): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 0, 0, 0));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.toLocaleString("da-DK", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }) + " UTC";
}

export function DailyImportToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [nextRun, setNextRun] = useState<string>("");

  useEffect(() => {
    setNextRun(getNextRun03UTC());
  }, []);

  async function toggle() {
    const newValue = !enabled;
    setSaving(true);
    try {
      await fetch("/api/admin/system-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "daily_import_enabled", value: newValue }),
      });
      setEnabled(newValue);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      background: "#fff",
      borderRadius: "10px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
      overflow: "hidden",
      marginBottom: "32px",
    }}>
      <div style={{
        background: "#EEF2F7",
        borderBottom: "1px solid #dde3ed",
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{
          fontSize: "11px", letterSpacing: "0.08em",
          textTransform: "uppercase", fontWeight: 700, color: "#5a6a85",
        }}>
          Daglig import
        </span>
      </div>

      <div style={{ padding: "20px 24px", display: "flex", alignItems: "center", gap: "24px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={toggle}
            disabled={saving}
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              width: "44px",
              height: "24px",
              borderRadius: "12px",
              border: "none",
              cursor: saving ? "not-allowed" : "pointer",
              background: enabled ? "#16a34a" : "#d1d5db",
              transition: "background 0.15s",
              padding: 0,
              opacity: saving ? 0.6 : 1,
            }}
            aria-label={enabled ? "Slå daglig import fra" : "Slå daglig import til"}
          >
            <span style={{
              position: "absolute",
              left: enabled ? "22px" : "2px",
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              transition: "left 0.15s",
            }} />
          </button>
          <span style={{ fontSize: "14px", fontWeight: 600, color: enabled ? "#15803d" : "#6b7280" }}>
            {enabled ? "Aktiveret" : "Deaktiveret"}
          </span>
        </div>

        <div style={{ fontSize: "13px", color: "#5a6a85" }}>
          Kører dagligt kl. 03:00 UTC — C1 → C4 → C2 → PubMed Sync
        </div>

        {nextRun && (
          <div style={{ fontSize: "13px", color: "#94a3b8", marginLeft: "auto" }}>
            Næste kørsel: <span style={{ fontWeight: 600, color: "#5a6a85" }}>{nextRun}</span>
          </div>
        )}
      </div>
    </div>
  );
}
