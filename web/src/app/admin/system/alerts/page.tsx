"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

interface Alert {
  id:         string;
  title:      string;
  message:    string;
  type:       "info" | "warning" | "error";
  active:     boolean;
  expires_at: string | null;
  created_at: string;
}

const TYPE_COLORS = {
  info:    { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8", label: "Info" },
  warning: { bg: "#fffbeb", border: "#fde68a", text: "#b45309", label: "Warning" },
  error:   { bg: "#fef2f2", border: "#fecaca", text: "#dc2626", label: "Error" },
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AlertsPage() {
  const [alerts, setAlerts]   = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Form state
  const [title,     setTitle]     = useState("");
  const [message,   setMessage]   = useState("");
  const [type,      setType]      = useState<"info" | "warning" | "error">("info");
  const [expiresAt, setExpiresAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/alerts");
      if (!res.ok) throw new Error(await res.text());
      setAlerts(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { title, message, type };
      if (expiresAt) body.expires_at = new Date(expiresAt).toISOString();
      const res = await fetch("/api/admin/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create");
      }
      setTitle("");
      setMessage("");
      setType("info");
      setExpiresAt("");
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(alert: Alert) {
    try {
      const res = await fetch(`/api/admin/alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !alert.active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this alert?")) return;
    try {
      const res = await fetch(`/api/admin/alerts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  const card: React.CSSProperties = {
    background: "#fff", borderRadius: "10px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
    overflow: "hidden", marginBottom: "16px",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", fontSize: "14px", borderRadius: "6px",
    border: "1px solid #dde3ed", background: "#fff", outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "40px 24px 80px" }}>

        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← System
          </Link>
        </div>

        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            System · Alerts
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>System Alerts</h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Broadcast messages to all logged-in users. Dismissed alerts are hidden per-browser.
          </p>
        </div>

        {/* Create form */}
        <div style={card}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
              New Alert
            </span>
          </div>
          <form onSubmit={(e) => { void handleCreate(e); }} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#5a6a85", display: "block", marginBottom: "6px" }}>Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g. Scheduled maintenance"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#5a6a85", display: "block", marginBottom: "6px" }}>Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={2}
                placeholder="e.g. Scheduled maintenance on Friday 22 March at 10:00 CET"
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#5a6a85", display: "block", marginBottom: "6px" }}>Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as "info" | "warning" | "error")}
                  style={inputStyle}
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#5a6a85", display: "block", marginBottom: "6px" }}>
                  Expires at <span style={{ fontWeight: 400, color: "#aaa" }}>(optional)</span>
                </label>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
            {error && (
              <div style={{ fontSize: "13px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "6px", padding: "8px 12px" }}>
                {error}
              </div>
            )}
            <div>
              <button
                type="submit"
                disabled={saving || !title.trim() || !message.trim()}
                style={{
                  fontSize: "13px", fontWeight: 700, padding: "8px 20px", borderRadius: "7px",
                  background: saving || !title.trim() || !message.trim() ? "#e2e8f0" : "#1a1a1a",
                  color: saving || !title.trim() || !message.trim() ? "#94a3b8" : "#fff",
                  border: "none", cursor: saving || !title.trim() || !message.trim() ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Creating…" : "Create alert"}
              </button>
            </div>
          </form>
        </div>

        {/* Alert list */}
        <div style={{ marginTop: "28px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "12px" }}>
            All Alerts
          </div>
          {loading ? (
            <div style={{ fontSize: "14px", color: "#888", padding: "24px 0" }}>Loading…</div>
          ) : alerts.length === 0 ? (
            <div style={{ fontSize: "14px", color: "#888", padding: "24px 0" }}>No alerts yet.</div>
          ) : (
            alerts.map((alert) => {
              const colors = TYPE_COLORS[alert.type];
              const isExpired = alert.expires_at ? new Date(alert.expires_at) < new Date() : false;
              return (
                <div key={alert.id} style={{
                  ...card, marginBottom: "12px",
                  opacity: !alert.active || isExpired ? 0.55 : 1,
                }}>
                  <div style={{ padding: "14px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
                        <span style={{
                          fontSize: "11px", fontWeight: 700, borderRadius: "4px", padding: "2px 8px",
                          background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`,
                        }}>
                          {colors.label}
                        </span>
                        {!alert.active && (
                          <span style={{ fontSize: "11px", fontWeight: 700, borderRadius: "4px", padding: "2px 8px", background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0" }}>
                            Inactive
                          </span>
                        )}
                        {isExpired && (
                          <span style={{ fontSize: "11px", fontWeight: 700, borderRadius: "4px", padding: "2px 8px", background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0" }}>
                            Expired
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "14px", color: "#1a1a1a", lineHeight: 1.5 }}>
                        <strong>{alert.title}</strong>
                        {" — "}
                        {alert.message}
                      </div>
                      <div style={{ fontSize: "12px", color: "#aaa", marginTop: "6px" }}>
                        Created {fmtDate(alert.created_at)}
                        {alert.expires_at && ` · Expires ${fmtDate(alert.expires_at)}`}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                      <button
                        onClick={() => { void toggleActive(alert); }}
                        style={{
                          fontSize: "12px", fontWeight: 600, padding: "5px 12px", borderRadius: "6px",
                          background: alert.active ? "#fef2f2" : "#f0fdf4",
                          color: alert.active ? "#dc2626" : "#15803d",
                          border: `1px solid ${alert.active ? "#fecaca" : "#bbf7d0"}`,
                          cursor: "pointer",
                        }}
                      >
                        {alert.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => { void handleDelete(alert.id); }}
                        style={{
                          fontSize: "12px", fontWeight: 600, padding: "5px 12px", borderRadius: "6px",
                          background: "#fff", color: "#888",
                          border: "1px solid #e2e8f0",
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
}
