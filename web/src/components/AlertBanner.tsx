"use client";

import { useState, useEffect } from "react";

interface Alert {
  id:      string;
  title:   string;
  message: string;
  type:    "info" | "warning" | "error";
}

const STYLES: Record<Alert["type"], { bg: string; border: string; text: string; dot: string }> = {
  info:    { bg: "#eff6ff", border: "#bfdbfe", text: "#1e40af", dot: "#3b82f6" },
  warning: { bg: "#fffbeb", border: "#fde68a", text: "#92400e", dot: "#f59e0b" },
  error:   { bg: "#fef2f2", border: "#fecaca", text: "#991b1b", dot: "#ef4444" },
};

function dismissKey(id: string) {
  return `dismissed-alert-${id}`;
}

export default function AlertBanner() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    void fetch("/api/alerts")
      .then((res) => res.json())
      .then((data: Alert[]) => {
        const visible = data.filter((a) => {
          try {
            return !localStorage.getItem(dismissKey(a.id));
          } catch {
            return true;
          }
        });
        setAlerts(visible);
      })
      .catch(() => {/* silently ignore */});
  }, []);

  function dismiss(id: string) {
    try {
      localStorage.setItem(dismissKey(id), "1");
    } catch {/* ignore */}
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  if (alerts.length === 0) return null;

  return (
    <div>
      {alerts.map((alert) => {
        const s = STYLES[alert.type];
        return (
          <div
            key={alert.id}
            style={{
              background: s.bg,
              borderBottom: `1px solid ${s.border}`,
              padding: "10px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: s.dot, flexShrink: 0, display: "inline-block" }} />
              <span style={{ fontSize: "13px", color: s.text, lineHeight: 1.4 }}>
                <strong style={{ fontWeight: 700 }}>{alert.title}</strong>
                {" — "}
                {alert.message}
              </span>
            </div>
            <button
              onClick={() => dismiss(alert.id)}
              aria-label="Dismiss"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: s.text, fontSize: "16px", lineHeight: 1, padding: "2px 4px",
                flexShrink: 0, opacity: 0.6,
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
