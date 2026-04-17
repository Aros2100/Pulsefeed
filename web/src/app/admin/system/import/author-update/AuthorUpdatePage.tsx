"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

/* ═══ Types ═══════════════════════════════════════════════════════════════════ */

interface UpdateLog {
  id:           string;
  started_at:   string;
  completed_at: string | null;
  status:       "running" | "completed" | "failed";
  processed:    number | null;
  scenario_a:   number | null;
  scenario_b:   number | null;
  scenario_c:   number | null;
  unmatched:    number | null;
  errors:       { articleId: string; error: string }[] | null;
  dry_run:      boolean;
  triggered_by: string | null;
}

interface StatusResponse {
  ok:           boolean;
  pendingCount: number;
  logs:         UpdateLog[];
}

/* ═══ Helpers ═════════════════════════════════════════════════════════════════ */

function fmt(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("da-DK", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function num(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("da-DK");
}

function duration(log: UpdateLog): string {
  if (!log.completed_at) return "—";
  const ms = new Date(log.completed_at).getTime() - new Date(log.started_at).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

/* ═══ Small components ════════════════════════════════════════════════════════ */

function Spinner() {
  return (
    <svg style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} viewBox="0 0 24 24" fill="none">
      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function StatusBadge({ status }: { status: UpdateLog["status"] }) {
  const map: Record<UpdateLog["status"], { label: string; color: string; bg: string }> = {
    completed: { label: "Fuldført", color: "#166534", bg: "#dcfce7" },
    running:   { label: "Kører",    color: "#92400e", bg: "#fef3c7" },
    failed:    { label: "Fejlet",   color: "#991b1b", bg: "#fee2e2" },
  };
  const { label, color, bg } = map[status] ?? map.failed;
  return (
    <span style={{
      fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px",
      color, background: bg, whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

/* ═══ Design tokens ═══════════════════════════════════════════════════════════ */

const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: "10px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
  overflow: "hidden", marginBottom: "24px",
};

const sectionHeader: React.CSSProperties = {
  background: "#EEF2F7", borderBottom: "1px solid #dde3ed",
  padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
};

const headerLabel: React.CSSProperties = {
  fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, color: "#5a6a85",
};

const thStyle: React.CSSProperties = {
  padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85",
  borderBottom: "1px solid #eef0f4", background: "#f8f9fb",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 16px", fontSize: "13px", color: "#1a1a1a", borderBottom: "1px solid #f1f3f7",
};

/* ═══ Main component ══════════════════════════════════════════════════════════ */

export default function AuthorUpdatePage() {
  const [triggering,   setTriggering]   = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [logs,         setLogs]         = useState<UpdateLog[]>([]);
  const [loading,      setLoading]      = useState(true);

  const isRunning = logs[0]?.status === "running";

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/author-update/status", { cache: "no-store" });
      const d = (await res.json()) as StatusResponse;
      if (d.ok) {
        setPendingCount(d.pendingCount);
        setLogs(d.logs ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  // Poll every 3s while a run is in progress
  useEffect(() => {
    if (!isRunning) return;
    const iv = setInterval(() => { void fetchStatus(); }, 3000);
    return () => clearInterval(iv);
  }, [isRunning, fetchStatus]);

  async function handleRun() {
    setTriggering(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/author-update/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      const d = await res.json();
      if (!d.ok) {
        setError(d.error ?? "Kørsel fejlede");
        setTriggering(false);
        return;
      }
      // Short delay to let server create the log row, then start polling
      setTimeout(() => { void fetchStatus(); setTriggering(false); }, 1500);
    } catch {
      setError("Netværksfejl");
      setTriggering(false);
    }
  }

  const lastCompleted = logs.find((l) => l.status === "completed");

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system/import" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Import oversigt
          </Link>
        </div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "32px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px" }}>Author Update</h1>
            <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
              Opdaterer forfatterlister på artikler hvor PubMed har ændret forfattere siden import
            </p>
          </div>
          <button
            onClick={handleRun}
            disabled={triggering || isRunning}
            style={{
              padding: "9px 20px", fontSize: "13px", fontWeight: 700,
              background: triggering || isRunning ? "#9ca3af" : "#E83B2A", color: "#fff",
              border: "none", borderRadius: "8px", cursor: triggering || isRunning ? "default" : "pointer",
              whiteSpace: "nowrap", marginTop: "4px",
              display: "inline-flex", alignItems: "center", gap: "8px",
            }}
          >
            {(triggering || isRunning) && <Spinner />}
            {isRunning ? "Kører…" : triggering ? "Starter…" : "Kør nu"}
          </button>
        </div>

        {error && (
          <div style={{ padding: "10px 16px", borderRadius: "8px", background: "#fef2f2", border: "1px solid #fecaca", marginBottom: "20px", fontSize: "13px", color: "#b91c1c" }}>
            {error}
          </div>
        )}

        {/* ═══ Status KPIs ═══ */}
        <div style={cardStyle}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Status</span>
          </div>
          <div style={{ padding: "20px 24px", display: "flex", gap: "48px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5a6a85", marginBottom: "6px" }}>
                Afventer opdatering
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: "#1a1a1a", fontVariantNumeric: "tabular-nums" }}>
                {loading ? "—" : (pendingCount ?? 0).toLocaleString("da-DK")}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5a6a85", marginBottom: "6px" }}>
                Seneste kørsel
              </div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>
                {loading ? "—" : lastCompleted ? fmt(lastCompleted.completed_at) : "Ingen endnu"}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ Log table ═══ */}
        <div style={cardStyle}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Kørselslog</span>
          </div>
          {loading ? (
            <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#888" }}>Henter log…</div>
          ) : logs.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#888" }}>Ingen kørsler endnu</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "800px" }}>
                <thead>
                  <tr>
                    {["Dato", "Behandlet", "A (matchet)", "B (nye)", "C (fjernet)", "Ikke matchet", "Fejl", "Dry run", "Varighed", "Status"].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#5a6a85" }}>{fmt(log.started_at)}</td>
                      <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>{num(log.processed)}</td>
                      <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>{num(log.scenario_a)}</td>
                      <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>{num(log.scenario_b)}</td>
                      <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>{num(log.scenario_c)}</td>
                      <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>{num(log.unmatched)}</td>
                      <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>
                        {log.errors && log.errors.length > 0 ? (
                          <span style={{ color: "#dc2626", fontWeight: 700 }}>{log.errors.length}</span>
                        ) : (
                          <span style={{ color: "#9ca3af" }}>0</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle }}>
                        {log.dry_run ? (
                          <span style={{ fontSize: "11px", fontWeight: 700, color: "#6366f1", background: "#eef2ff", borderRadius: "4px", padding: "2px 7px" }}>Ja</span>
                        ) : (
                          <span style={{ color: "#9ca3af" }}>Nej</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#5a6a85" }}>{duration(log)}</td>
                      <td style={{ ...tdStyle }}><StatusBadge status={log.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
