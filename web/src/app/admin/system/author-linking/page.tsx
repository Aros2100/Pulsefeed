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
  errors: string[];
}

interface ImportOverviewRow {
  id: string;
  started_at: string;
  articles_imported: number;
  author_slots_imported: number;
  trigger: string | null;
  filter_name: string | null;
  circle: number | null;
  authors_linked: number | null;
  linking_status: string | null;
  unlinked_author_slots: number;
  new_authors: number | null;
  duplicates: number | null;
  rejected: number | null;
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
  unlinkedCount: number;
  unlinkedAuthorSlots: number;
  totalAuthors: number;
  totalNew: number;
  totalDuplicates: number;
  totalRejected: number;
  rejectedAuthorsCount: number;
}

interface ImportOverviewResponse {
  ok: boolean;
  rows: ImportOverviewRow[];
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

function KpiCard({ label, value, color = "#111827", subtitle }: {
  label: string;
  value: number | null | undefined;
  color?: string;
  subtitle?: string;
}) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
      padding: "20px 24px", flex: 1, minWidth: 140,
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
        {value == null ? "—" : value.toLocaleString("da-DK")}
      </div>
      <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{label}</div>
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

export default function AuthorLinkingPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [overview, setOverview] = useState<ImportOverviewRow[] | null>(null);
  const [starting, setStarting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [rejectedRows, setRejectedRows] = useState<RejectedRow[] | null>(null);
  const [loadingRejected, setLoadingRejected] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [statusRes, overviewRes] = await Promise.all([
        fetch("/api/admin/author-linking/status"),
        fetch("/api/admin/author-linking/import-overview"),
      ]);
      const statusJson = (await statusRes.json()) as StatusResponse;
      const overviewJson = (await overviewRes.json()) as ImportOverviewResponse;
      if (statusJson.ok) setStatus(statusJson);
      if (overviewJson.ok) setOverview(overviewJson.rows);
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

  // Compute accumulated for import log
  const withAccumulated = overview
    ? [...overview]
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())
        .reduce<(ImportOverviewRow & { accumulated: number })[]>((acc, row, i) => {
          const prev = acc[i - 1]?.accumulated ?? 0;
          return [...acc, { ...row, accumulated: prev + row.author_slots_imported }];
        }, [])
        .reverse()
    : null;

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
            <KpiCard label="Afvist" value={status?.totalRejected} color="#dc2626" />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end", gap: 8, minWidth: 140 }}>
              {status?.latest && (
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  {status.latest.articles_processed.toLocaleString("da-DK")} artikler behandlet · {status.latest.authors_linked.toLocaleString("da-DK")} forfattere koblet
                </div>
              )}
              <button
                onClick={() => { void handleShowRejected(); }}
                style={{
                  padding: "8px 16px", borderRadius: 6, fontSize: 13,
                  background: "#fff", color: "#374151", border: "1px solid #d1d5db", cursor: "pointer",
                }}
              >
                Se afviste ({status?.rejectedAuthorsCount ?? 0})
              </button>
            </div>
          </div>

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

        {/* IMPORT LOG */}
        <div style={{
          background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
          padding: 24, marginBottom: 20,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#E83B2A", letterSpacing: "0.05em", marginBottom: 16 }}>
            IMPORT-KØRSLER
          </div>

          {withAccumulated == null ? (
            <div style={{ padding: 32, textAlign: "center", fontSize: 13, color: "#9ca3af" }}>Indlæser…</div>
          ) : withAccumulated.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", fontSize: 13, color: "#9ca3af" }}>Ingen import-kørsler endnu</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  {["DATO", "FILTER", "IMPORTERET", "AFVENTER", "AKKUMULERET"].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {withAccumulated.map((row) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "12px", color: "#374151", whiteSpace: "nowrap" }}>{fmt(row.started_at)}</td>
                    <td style={{ padding: "12px" }}>
                      {row.filter_name ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          {row.circle != null && (
                            <span style={{
                              background: "#dbeafe", color: "#1d4ed8", fontSize: 10, fontWeight: 700,
                              padding: "2px 6px", borderRadius: 4,
                            }}>
                              C{row.circle}
                            </span>
                          )}
                          <span style={{ color: "#374151" }}>{row.filter_name}</span>
                        </span>
                      ) : (
                        <span style={{ color: "#9ca3af" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "12px", color: "#374151", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {row.articles_imported.toLocaleString("da-DK")}
                    </td>
                    <td style={{ padding: "12px", color: row.unlinked_author_slots > 0 ? "#ea580c" : "#9ca3af", fontVariantNumeric: "tabular-nums" }}>
                      {row.unlinked_author_slots > 0 ? row.unlinked_author_slots.toLocaleString("da-DK") : "—"}
                    </td>
                    <td style={{ padding: "12px", color: "#111827", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {row.accumulated.toLocaleString("da-DK")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* REJECTED AUTHORS */}
        {showRejected && (
          <div style={{
            background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
            padding: 24,
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", letterSpacing: "0.05em" }}>
                AFVISTE FORFATTERE
              </div>
              <button
                onClick={() => setShowRejected(false)}
                style={{
                  padding: "4px 12px", borderRadius: 4, fontSize: 12,
                  background: "transparent", color: "#6b7280", border: "none", cursor: "pointer",
                }}
              >
                Luk
              </button>
            </div>

            {loadingRejected ? (
              <div style={{ padding: 32, textAlign: "center", fontSize: 13, color: "#9ca3af" }}>Indlæser…</div>
            ) : !rejectedRows?.length ? (
              <div style={{ padding: 32, textAlign: "center", fontSize: 13, color: "#9ca3af" }}>Ingen afviste forfattere</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                    {["PMID", "ARTIKEL", "POS.", "ÅRSAG", "DATO"].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rejectedRows.map((row) => (
                    <tr key={row.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "12px", color: "#374151", fontFamily: "monospace", fontSize: 12 }}>
                        {row.pubmed_id}
                      </td>
                      <td style={{ padding: "12px", color: "#374151", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.articles?.title ?? "—"}
                      </td>
                      <td style={{ padding: "12px", color: "#6b7280", textAlign: "center" }}>
                        {row.position ?? "—"}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <span style={{
                          background: "#fef2f2", color: "#dc2626", fontSize: 11, fontWeight: 600,
                          padding: "2px 8px", borderRadius: 4,
                        }}>
                          {row.reason}
                        </span>
                      </td>
                      <td style={{ padding: "12px", color: "#6b7280", whiteSpace: "nowrap" }}>
                        {fmt(row.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
