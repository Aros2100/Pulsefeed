"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface AuthorLinkingLog {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: "running" | "completed" | "failed";
  articles_processed: number;
  authors_processed: number;
  authors_linked: number;
  new_authors: number;
  existing: number;
  errors: number;
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
  totalExisting: number;
  totalErrors: number;
  totalAuthorsProcessed: number;
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
  const [autoRunning, setAutoRunning] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [resetting, setResetting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [rejectedRows, setRejectedRows] = useState<RejectedRow[] | null>(null);
  const [loadingRejected, setLoadingRejected] = useState(false);

  // Refs for auto-chaining logic (don't trigger re-renders)
  const prevBatchStatusRef = useRef<string | undefined>(undefined);
  const batchCountRef = useRef(0);

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

  // Polling interval — active while a batch is running OR while auto-chaining between batches
  useEffect(() => {
    if (!isRunning && !autoRunning) return;
    const id = setInterval(() => { void fetchAll(); }, 3000);
    return () => clearInterval(id);
  }, [isRunning, autoRunning, fetchAll]);

  // Auto-chaining: when a batch completes, re-trigger if articles remain unlinked
  useEffect(() => {
    if (!autoRunning) {
      prevBatchStatusRef.current = undefined;
      return;
    }

    const currentStatus = status?.latest?.status;
    const prevStatus = prevBatchStatusRef.current;
    prevBatchStatusRef.current = currentStatus;

    if (prevStatus === "running" && currentStatus === "failed") {
      setAutoRunning(false);
      setActionError("Batch fejlede");
      return;
    }

    if (prevStatus === "running" && currentStatus === "completed") {
      const unlinked = status?.unlinkedCount ?? 0;

      if (unlinked === 0) {
        setAutoRunning(false);
        setProgressMsg(`Færdig efter ${batchCountRef.current} batch${batchCountRef.current > 1 ? "es" : ""}`);
        return;
      }

      // Still articles left — schedule next batch after short pause
      setProgressMsg(`Batch ${batchCountRef.current} færdig — ${unlinked.toLocaleString("da-DK")} artikler tilbage`);
      const timer = setTimeout(() => {
        batchCountRef.current += 1;
        setProgressMsg(`Starter batch ${batchCountRef.current}…`);
        void fetch("/api/admin/author-linking/start", { method: "POST" })
          .then((r) => r.json())
          .then((json: { ok: boolean; error?: string }) => {
            if (!json.ok) {
              setAutoRunning(false);
              setActionError(json.error ?? "Ukendt fejl");
            } else {
              void fetchAll(); // trigger immediate poll so isRunning picks up
            }
          })
          .catch(() => {
            setAutoRunning(false);
            setActionError("Netværksfejl");
          });
      }, 2000);

      return () => clearTimeout(timer);
    }

    // Update live progress while batch is running
    if (currentStatus === "running") {
      const remaining = status?.unlinkedCount ?? 0;
      setProgressMsg(
        `Kører batch ${batchCountRef.current}` +
        (remaining > 0 ? ` — ${remaining.toLocaleString("da-DK")} artikler tilbage` : "…")
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, autoRunning]);

  async function handleStart() {
    setAutoRunning(true);
    setActionError(null);
    batchCountRef.current = 1;
    setProgressMsg("Starter batch 1…");

    try {
      const res = await fetch("/api/admin/author-linking/start", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setAutoRunning(false);
        setActionError(json.error ?? "Ukendt fejl");
      } else {
        void fetchAll();
      }
    } catch {
      setAutoRunning(false);
      setActionError("Netværksfejl");
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
          <Link href="/admin/system/import" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>
            ← Import
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
            <button
              onClick={() => { void handleShowRejected(); setShowRejected(true); }}
              disabled={!status?.totalErrors || status.totalErrors === 0}
              style={{
                padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db",
                cursor: status?.totalErrors ? "pointer" : "default",
                opacity: status?.totalErrors ? 1 : 0.4,
              }}
            >
              Se fejl {status?.totalErrors ? `(${status.totalErrors.toLocaleString("da-DK")})` : ""}
            </button>
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
              disabled={isRunning || autoRunning}
              style={{
                padding: "10px 24px", borderRadius: 8, fontSize: 14, fontWeight: 600,
                background: isRunning || autoRunning ? "#d1d5db" : "#E83B2A",
                color: isRunning || autoRunning ? "#374151" : "#fff",
                border: "none",
                cursor: isRunning || autoRunning ? "default" : "pointer",
              }}
            >
              {autoRunning ? (progressMsg || "Starter…") : isRunning ? "Kører…" : "Kør import nu"}
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

          {/* Balance check */}
          {status != null && (status.totalNew + status.totalExisting + status.totalErrors) > 0 && (() => {
            const total = status.totalNew + status.totalExisting + status.totalErrors;
            const balanced = true; // new + existing + errors always equals total by definition
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
                  Nye ({status.totalNew.toLocaleString("da-DK")}) + Eksisterede ({status.totalExisting.toLocaleString("da-DK")}) + Fejl ({status.totalErrors.toLocaleString("da-DK")}) = {total.toLocaleString("da-DK")} slots processeret
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
                  {["DATO", "ARTIKLER BEHANDLET", "FORFATTERE BEHANDLET", "NYE", "EKSISTEREDE", "FEJL", "VARIGHED", "STATUS"].map((h) => (
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
                    <td style={{ padding: "12px", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "#374151" }}>
                      {log.authors_processed.toLocaleString("da-DK")}
                    </td>
                    <td style={{ padding: "12px", fontVariantNumeric: "tabular-nums", color: "#16a34a" }}>
                      {log.new_authors.toLocaleString("da-DK")}
                    </td>
                    <td style={{ padding: "12px", fontVariantNumeric: "tabular-nums", color: "#2563eb" }}>
                      {log.existing.toLocaleString("da-DK")}
                    </td>
                    <td style={{ padding: "12px", fontVariantNumeric: "tabular-nums", color: log.errors > 0 ? "#dc2626" : "#9ca3af" }}>
                      {log.errors > 0 ? log.errors.toLocaleString("da-DK") : "—"}
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

    {/* Rejected authors modal */}
    {showRejected && (
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24,
        }}
        onClick={() => setShowRejected(false)}
      >
        <div
          style={{
            background: "#fff", borderRadius: 12, width: "100%", maxWidth: 760,
            maxHeight: "80vh", display: "flex", flexDirection: "column",
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal header */}
          <div style={{
            padding: "16px 24px", borderBottom: "1px solid #e5e7eb",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Afviste forfattere</div>
              {rejectedRows && (
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                  Viser {Math.min(rejectedRows.length, 20)} af {status?.rejectedAuthorsCount ?? rejectedRows.length}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowRejected(false)}
              style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#6b7280", lineHeight: 1 }}
            >
              ✕
            </button>
          </div>

          {/* Modal body — scrollable table */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loadingRejected ? (
              <div style={{ padding: 32, textAlign: "center", fontSize: 13, color: "#9ca3af" }}>Indlæser…</div>
            ) : !rejectedRows?.length ? (
              <div style={{ padding: 32, textAlign: "center", fontSize: 13, color: "#9ca3af" }}>Ingen afviste forfattere</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead style={{ position: "sticky", top: 0, background: "#f8f9fb", zIndex: 1 }}>
                  <tr>
                    {["PUBMED ID", "FORFATTER", "ÅRSAG", "DATO"].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rejectedRows.slice(0, 20).map((row) => (
                    <tr key={row.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
                        {row.pubmed_id}
                      </td>
                      <td style={{ padding: "10px 12px", color: "#374151" }}>
                        {(row.raw_data?.lastName as string | undefined || row.raw_data?.foreName as string | undefined)
                          ? `${(row.raw_data.lastName as string | undefined) ?? ""}${row.raw_data.foreName ? ", " + (row.raw_data.foreName as string) : ""}`.trim()
                          : "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{
                          background: "#fef2f2", color: "#dc2626", fontSize: 10, fontWeight: 600,
                          padding: "2px 6px", borderRadius: 4,
                        }}>
                          {row.reason}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#9ca3af", whiteSpace: "nowrap", fontSize: 12 }}>
                        {fmt(row.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    )}
  </div>
  );
}
