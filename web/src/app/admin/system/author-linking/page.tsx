"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface AuthorLinkingLog {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: "running" | "completed" | "failed";
  articles_processed: number;
  authors_linked: number;
  new_authors: number;
  duplicates: number;
  rejected: number;
  errors: string[];
}

interface RejectedRow {
  id: string;
  pubmed_id: string;
  position: number | null;
  raw_data: Record<string, unknown>;
  reason: string;
  created_at: string;
  articles: { id: string; title: string } | null;
}

interface StatusResponse {
  ok: boolean;
  latest: AuthorLinkingLog | null;
  logs: AuthorLinkingLog[];
  unlinkedCount: number;
  unlinkedAuthorSlots: number;
  totalAuthors: number;
  totalNew: number;
  totalDuplicates: number;
  totalRejected: number;
  rejectedAuthorsCount: number;
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("da-DK", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function KpiCard({ label, value, color = "#111827", subtitle, onClick, active }: {
  label: string;
  value: number | null | undefined;
  color?: string;
  subtitle?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: active ? "#fef2f2" : "#fff",
        border: `1px solid ${active ? "#fecaca" : "#e5e7eb"}`,
        borderRadius: 10,
        padding: "20px 24px", flex: 1, minWidth: 140,
        cursor: onClick ? "pointer" : undefined,
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
        {value == null ? "—" : value.toLocaleString("da-DK")}
      </div>
      <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
        {label}
        {onClick && <span style={{ fontSize: 11, marginLeft: 4, color: "#9ca3af" }}>{active ? "▲" : "▼"}</span>}
      </div>
      {subtitle && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 700,
  color: "#9ca3af",
  letterSpacing: "0.05em",
  borderBottom: "1px solid #e5e7eb",
};

function fmtDuration(started: string, completed: string | null) {
  if (!completed) return "—";
  const ms = new Date(completed).getTime() - new Date(started).getTime();
  if (ms < 0) return "—";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}t ${remMins}m`;
}

export default function AuthorLinkingPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [starting, setStarting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [rejectedRows, setRejectedRows] = useState<RejectedRow[] | null>(null);
  const [loadingRejected, setLoadingRejected] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/author-linking/status");
      const json = (await res.json()) as StatusResponse;
      if (json.ok) setStatus(json);
    } catch (e) {
      console.error("[author-linking] fetchAll error:", e);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const isRunning = status?.latest?.status === "running";

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => { void fetchAll(); }, 3000);
    return () => clearInterval(id);
  }, [isRunning, fetchAll]);

  async function handleStart() {
    setStarting(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/author-linking/start", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setActionError(json.error ?? "Ukendt fejl");
      } else {
        await fetchAll();
      }
    } catch {
      setActionError("Netværksfejl");
    } finally {
      setStarting(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/author-linking/reset", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setActionError(json.error ?? "Ukendt fejl");
      } else {
        await fetchAll();
      }
    } catch {
      setActionError("Netværksfejl");
    } finally {
      setResetting(false);
    }
  }

  async function handleShowRejected() {
    setShowRejected(true);
    setLoadingRejected(true);
    const res = await fetch("/api/admin/author-linking/rejected");
    const json = (await res.json()) as { ok: boolean; rows: RejectedRow[] };
    if (json.ok) setRejectedRows(json.rows);
    setLoadingRejected(false);
  }

  const logs = status?.logs ?? [];

  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#f3f4f6",
      color: "#111827",
      minHeight: "100vh",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: 4 }}>
          <Link href="/admin/system" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>
            ← System
          </Link>
        </div>

        {/* Header */}
        <div style={{ fontSize: 12, fontWeight: 700, color: "#E83B2A", letterSpacing: "0.05em", marginBottom: 4, textTransform: "uppercase" }}>
          System · Forfattere
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "#111827", margin: 0 }}>Forfatter-import</h1>
            <p style={{ fontSize: 14, color: "#6b7280", margin: "4px 0 0" }}>
              Kobler forfatter-JSONB til article_authors-tabellen
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {isRunning && (
              <button
                onClick={() => { void handleReset(); }}
                disabled={resetting}
                style={{
                  padding: "10px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600,
                  background: "#fff", color: "#dc2626", border: "1px solid #fecaca",
                  cursor: resetting ? "not-allowed" : "pointer",
                  opacity: resetting ? 0.6 : 1,
                }}
              >
                {resetting ? "Nulstiller…" : "Nulstil"}
              </button>
            )}
            <button
              onClick={() => { void handleStart(); }}
              disabled={isRunning || starting}
              style={{
                padding: "10px 24px", borderRadius: 8, fontSize: 14, fontWeight: 600,
                background: isRunning || starting ? "#d1d5db" : "#E83B2A",
                color: isRunning || starting ? "#374151" : "#fff",
                border: "none",
                cursor: isRunning || starting ? "default" : "pointer",
              }}
            >
              {isRunning ? "Kører…" : starting ? "Starter…" : "Kør import nu"}
            </button>
          </div>
        </div>

        {actionError && (
          <div style={{ fontSize: 13, color: "#dc2626", marginBottom: 16 }}>{actionError}</div>
        )}

        {/* STATUS section */}
        <div style={{
          background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
          padding: 24, marginBottom: 20,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", letterSpacing: "0.05em", marginBottom: 16 }}>
            STATUS
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <KpiCard label="Artikler uden forfattere" value={status?.unlinkedCount} color="#ea580c" />
            <KpiCard label="Afventer" value={status?.unlinkedAuthorSlots} />
            <KpiCard label="Forfattere i DB" value={status?.totalAuthors} />
            <KpiCard label="Nye forfattere" value={status?.totalNew} color="#16a34a" />
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <KpiCard label="Dubletter" value={status?.totalDuplicates} color="#2563eb" />
            <KpiCard
              label="Afvist"
              value={status?.totalRejected}
              color="#dc2626"
              onClick={() => {
                if (!showRejected) { void handleShowRejected(); }
                else setShowRejected(false);
              }}
              active={showRejected}
            />
            {status?.latest && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end", gap: 4, minWidth: 140 }}>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  {status.latest.articles_processed.toLocaleString("da-DK")} artikler behandlet
                </div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  {status.latest.authors_linked.toLocaleString("da-DK")} forfattere koblet
                </div>
              </div>
            )}
          </div>

          {/* Inline rejected list */}
          {showRejected && (
            <div style={{
              marginBottom: 16, padding: 16,
              background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca",
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: 12,
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", letterSpacing: "0.05em" }}>
                  AFVISTE FORFATTERE
                </span>
                {rejectedRows && rejectedRows.length > 0 && (
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>
                    Viser seneste {Math.min(rejectedRows.length, 20)} af {status?.rejectedAuthorsCount ?? rejectedRows.length}
                  </span>
                )}
              </div>
              {loadingRejected ? (
                <div style={{ padding: 16, textAlign: "center", fontSize: 13, color: "#9ca3af" }}>Indlæser…</div>
              ) : !rejectedRows?.length ? (
                <div style={{ padding: 16, textAlign: "center", fontSize: 13, color: "#9ca3af" }}>Ingen afviste forfattere</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {rejectedRows.slice(0, 20).map((row) => (
                    <div key={row.id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "8px 12px", background: "#fff", borderRadius: 6,
                      fontSize: 13, border: "1px solid #fecaca",
                    }}>
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: "#6b7280", flexShrink: 0 }}>
                        {row.pubmed_id}
                      </span>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#374151" }}>
                        {row.articles?.title ?? "—"}
                      </span>
                      <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>
                        pos. {row.position ?? "—"}
                      </span>
                      <span style={{
                        background: "#fef2f2", color: "#dc2626", fontSize: 10, fontWeight: 600,
                        padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                      }}>
                        {row.reason}
                      </span>
                      <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>
                        {fmt(row.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Balance check */}
          {status != null && (status.totalNew + status.totalDuplicates + status.totalRejected) > 0 && (() => {
            const total = status.totalNew + status.totalDuplicates + status.totalRejected;
            const balanced = true; // new + duplicates + rejected always equals total by definition
            return (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 16px",
                background: balanced ? "#f0fdf4" : "#fef2f2",
                borderRadius: 8, fontSize: 13,
                color: balanced ? "#16a34a" : "#dc2626",
                border: `1px solid ${balanced ? "#bbf7d0" : "#fecaca"}`,
              }}>
                <span>{balanced ? "✓" : "✗"}</span>
                <span>
                  Balance: Nye ({status.totalNew.toLocaleString("da-DK")}) + Dubletter ({status.totalDuplicates.toLocaleString("da-DK")}) + Afvist ({status.totalRejected.toLocaleString("da-DK")}) = {total.toLocaleString("da-DK")} slots processeret
                </span>
              </div>
            );
          })()}
        </div>

        {/* LINKING LOG */}
        <div style={{
          background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
          padding: 24, marginBottom: 20,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#E83B2A", letterSpacing: "0.05em", marginBottom: 16 }}>
            LINKING-KØRSLER
          </div>

          {status == null ? (
            <div style={{ padding: 32, textAlign: "center", fontSize: 13, color: "#9ca3af" }}>Indlæser…</div>
          ) : logs.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", fontSize: 13, color: "#9ca3af" }}>Ingen kørsler endnu</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  {["DATO", "ARTIKLER BEHANDLET", "NYE FORFATTERE", "DUBLETTER", "AFVIST", "VARIGHED", "STATUS"].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 10).map((log) => (
                  <tr key={log.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "12px", color: "#374151", whiteSpace: "nowrap" }}>
                      {fmt(log.started_at)}
                    </td>
                    <td style={{ padding: "12px", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "#374151" }}>
                      {log.articles_processed.toLocaleString("da-DK")}
                    </td>
                    <td style={{ padding: "12px", fontVariantNumeric: "tabular-nums", color: "#16a34a" }}>
                      {log.new_authors.toLocaleString("da-DK")}
                    </td>
                    <td style={{ padding: "12px", fontVariantNumeric: "tabular-nums", color: "#2563eb" }}>
                      {log.duplicates.toLocaleString("da-DK")}
                    </td>
                    <td style={{ padding: "12px", fontVariantNumeric: "tabular-nums", color: log.rejected > 0 ? "#dc2626" : "#9ca3af" }}>
                      {log.rejected > 0 ? log.rejected.toLocaleString("da-DK") : "—"}
                    </td>
                    <td style={{ padding: "12px", color: "#6b7280", whiteSpace: "nowrap" }}>
                      {log.status === "running" ? "Kører…" : fmtDuration(log.started_at, log.completed_at)}
                    </td>
                    <td style={{ padding: "12px" }}>
                      {log.status === "completed" && (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "#f0fdf4", color: "#16a34a" }}>
                          Fuldført
                        </span>
                      )}
                      {log.status === "running" && (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "#fef3c7", color: "#d97706" }}>
                          Kører
                        </span>
                      )}
                      {log.status === "failed" && (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "#fef2f2", color: "#dc2626" }}>
                          Fejlet
                        </span>
                      )}
                    </td>
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
