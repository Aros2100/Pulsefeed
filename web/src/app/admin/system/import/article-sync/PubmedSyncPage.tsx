"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

/* ═══ Types ═══════════════════════════════════════════════════════════════════ */

interface SyncLog {
  runTime:   string;
  updated:   number;
  retracted: number;
  total:     number;
}

/* ═══ Helpers ═════════════════════════════════════════════════════════════════ */

function fmt(iso: string | null) {
  if (!iso) return "—";
  // runTime is "YYYY-MM-DDTHH:mm" — parse as local-ish
  const d = new Date(iso.length === 16 ? iso + ":00Z" : iso);
  return d.toLocaleString("da-DK", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function num(v: number) { return v.toLocaleString("da-DK"); }

/* ═══ Small components ════════════════════════════════════════════════════════ */

function Spinner() {
  return (
    <svg style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} viewBox="0 0 24 24" fill="none">
      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
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

const inputStyle: React.CSSProperties = {
  width: "100px", border: "1px solid #d1d5db", borderRadius: "8px",
  padding: "8px 12px", fontSize: "13px", color: "#1a1a1a", outline: "none",
};

/* ═══ Main component ══════════════════════════════════════════════════════════ */

export default function PubmedSyncPage() {
  const [running,     setRunning]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [logs,        setLogs]        = useState<SyncLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [mindate, setMindate] = useState(() => {
    const d = new Date(Date.now() - 7 * 86_400_000);
    return d.toISOString().slice(0, 10);
  });
  const [maxdate, setMaxdate] = useState(() => new Date().toISOString().slice(0, 10));
  const [limit,   setLimit]   = useState(500);

  /* ── Fetch logs ── */
  const fetchLogs = useCallback(async () => {
    const res = await fetch("/api/admin/system/pubmed-sync/logs");
    const d = await res.json();
    if (d.ok) {
      setLogs(d.runs ?? []);
      // If a run was in progress and new rows appeared, clear running state
      if (running && (d.runs ?? []).length > 0) setRunning(false);
    }
    setLoadingLogs(false);
  }, [running]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  // Poll while running
  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => { void fetchLogs(); }, 5000);
    return () => clearInterval(iv);
  }, [running, fetchLogs]);

  /* ── Trigger sync ── */
  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/system/pubmed-sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mindate, maxdate, limit }),
      });
      const d = await res.json();
      if (!d.ok) {
        setError(d.error ?? "Sync fejlede");
        setRunning(false);
      }
      // Refresh logs after a short delay (run is fire-and-forget on server)
      setTimeout(() => { void fetchLogs(); }, 3000);
    } catch {
      setError("Netværksfejl");
      setRunning(false);
    }
  }

  /* ── Render ── */
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
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px" }}>PubMed Sync</h1>
            <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
              Synkroniserer ændringer fra PubMed — opdaterer eksisterende artikler med datetype=mdat
            </p>
          </div>
          <button
            onClick={handleRun}
            disabled={running}
            style={{
              padding: "9px 20px", fontSize: "13px", fontWeight: 700,
              background: running ? "#9ca3af" : "#E83B2A", color: "#fff",
              border: "none", borderRadius: "8px", cursor: running ? "default" : "pointer",
              whiteSpace: "nowrap", marginTop: "4px",
              display: "inline-flex", alignItems: "center", gap: "8px",
            }}
          >
            {running && <Spinner />}
            {running ? "Synkroniserer…" : "Kør sync nu"}
          </button>
        </div>

        {error && (
          <div style={{ padding: "10px 16px", borderRadius: "8px", background: "#fef2f2", border: "1px solid #fecaca", marginBottom: "20px", fontSize: "13px", color: "#b91c1c" }}>
            {error}
          </div>
        )}

        {/* ═══ SECTION 1: Konfiguration ═══ */}
        <div style={cardStyle}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Konfiguration</span>
          </div>
          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#5a6a85", marginBottom: "6px" }}>
                  Fra (MDAT)
                </label>
                <input
                  type="date"
                  value={mindate}
                  onChange={(e) => setMindate(e.target.value)}
                  style={{ border: "1px solid #d1d5db", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", color: "#1a1a1a", outline: "none" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#5a6a85", marginBottom: "6px" }}>
                  Til (MDAT)
                </label>
                <input
                  type="date"
                  value={maxdate}
                  onChange={(e) => setMaxdate(e.target.value)}
                  style={{ border: "1px solid #d1d5db", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", color: "#1a1a1a", outline: "none" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#5a6a85", marginBottom: "6px" }}>
                  Max artikler
                </label>
                <input
                  type="number" min={1} max={50000}
                  value={limit}
                  onChange={(e) => setLimit(Math.max(1, parseInt(e.target.value) || 500))}
                  style={inputStyle}
                />
              </div>
            </div>
            <p style={{ fontSize: "12px", color: "#5a6a85", marginTop: "14px", marginBottom: 0, lineHeight: 1.6 }}>
              Syncer artikler modificeret på PubMed fra {fmt(mindate)} til {fmt(maxdate)}.
              Kun artikler der allerede er i databasen opdateres — nye artikler importeres via circle-import.
            </p>
          </div>
        </div>

        {/* ═══ SECTION 2: Sync log ═══ */}
        <div style={cardStyle}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Sync log</span>
          </div>
          {loadingLogs ? (
            <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#888" }}>Henter log…</div>
          ) : logs.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#888" }}>Ingen sync-kørsler endnu</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Dato", "Opdateret", "Retracted", "Total"].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.runTime}>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#5a6a85" }}>{fmt(log.runTime)}</td>
                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>{num(log.updated)}</td>
                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>
                      {log.retracted > 0 ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "#dc2626", fontWeight: 700 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#dc2626", display: "inline-block" }} />
                          {num(log.retracted)}
                        </span>
                      ) : (
                        <span style={{ color: "#9ca3af" }}>—</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{num(log.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}
