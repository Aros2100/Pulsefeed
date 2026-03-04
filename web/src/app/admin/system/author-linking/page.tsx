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

const thStyle: React.CSSProperties = {
  padding: "10px 16px",
  textAlign: "left",
  fontSize: "11px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#5a6a85",
  borderBottom: "1px solid #eef0f4",
  background: "#f8f9fb",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 16px",
  fontSize: "13px",
  color: "#1a1a1a",
  borderBottom: "1px solid #f1f3f7",
};

function LinkingStatusBadge({ status }: { status: string | null }) {
  if (status === "completed") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: "4px",
        borderRadius: "999px", padding: "2px 8px",
        fontSize: "11px", fontWeight: 600,
        background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0",
      }}>
        ✓ Linket
      </span>
    );
  }
  if (status === "running") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: "5px",
        borderRadius: "999px", padding: "2px 8px",
        fontSize: "11px", fontWeight: 600,
        background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe",
      }}>
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3b82f6", animation: "pulse 1.5s infinite" }} />
        Kører…
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: "4px",
        borderRadius: "999px", padding: "2px 8px",
        fontSize: "11px", fontWeight: 600,
        background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca",
      }}>
        Fejlet
      </span>
    );
  }
  // null = no linking job for this import
  return (
    <span style={{ fontSize: "12px", color: "#bbb" }}>⏳ Afventer</span>
  );
}

export default function AuthorLinkingPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [overview, setOverview] = useState<ImportOverviewRow[] | null>(null);
  const [starting, setStarting] = useState(false);
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

  async function handleShowRejected() {
    setShowRejected(true);
    setLoadingRejected(true);
    const res = await fetch("/api/admin/author-linking/rejected");
    const json = (await res.json()) as { ok: boolean; rows: RejectedRow[] };
    if (json.ok) setRejectedRows(json.rows);
    setLoadingRejected(false);
  }

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

  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#f5f7fa",
      color: "#1a1a1a",
      minHeight: "100vh",
    }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← System
          </Link>
        </div>
        <div style={{ marginBottom: "28px" }}>
          <div style={{
            fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A",
            textTransform: "uppercase", fontWeight: 700, marginBottom: "6px",
          }}>
            System · Forfattere
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "4px" }}>Forfatter-import</h1>
          <p style={{ fontSize: "13px", color: "#888" }}>
            Kobler forfatter-JSONB til article_authors-tabellen for alle artikler der mangler det
          </p>
        </div>

        {/* Summary stats + action */}
        <div style={{
          background: "#fff",
          borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          padding: "24px",
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "24px",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", flex: 1 }}>
            {/* Hero stats row */}
            <div style={{ display: "flex", gap: "32px", flexWrap: "wrap" }}>
              {[
                { label: "Artikler uden forfattere", value: status?.unlinkedCount,       color: "#1a1a1a" },
                { label: "Afventer",                  value: status?.unlinkedAuthorSlots, color: "#1a1a1a" },
                { label: "Forfattere i DB",           value: status?.totalAuthors,        color: "#1a1a1a" },
                { label: "Nye forfattere ✅",          value: status?.totalNew,            color: "#15803d" },
                { label: "Dubletter 🔄",              value: status?.totalDuplicates,     color: "#1d4ed8" },
                { label: "Afvist ❌",                 value: status?.totalRejected,       color: "#d97706" },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div style={{ fontSize: "12px", color: "#5a6a85", marginBottom: "4px" }}>{label}</div>
                  <div style={{ fontSize: "26px", fontWeight: 700, fontVariantNumeric: "tabular-nums", color }}>
                    {value == null ? "—" : value.toLocaleString("da-DK")}
                  </div>
                </div>
              ))}
            </div>
            {/* Balance check */}
            {status != null && (status.totalNew + status.totalDuplicates + status.totalRejected) > 0 && (() => {
              const processed = status.totalNew + status.totalDuplicates + status.totalRejected;
              const linked    = status.totalNew + status.totalDuplicates;
              const ok        = processed === linked + status.totalRejected;
              return (
                <div style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontWeight: 700, color: ok ? "#15803d" : "#b91c1c" }}>{ok ? "✓" : "✗"}</span>
                  <span style={{ color: "#5a6a85" }}>
                    Balance: Nye ({status.totalNew.toLocaleString("da-DK")}) + Dubletter ({status.totalDuplicates.toLocaleString("da-DK")}) + Afvist ({status.totalRejected.toLocaleString("da-DK")}) = {processed.toLocaleString("da-DK")} slots processeret
                  </span>
                </div>
              );
            })()}
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
            {isRunning && status?.latest && (
              <div style={{ fontSize: "13px", color: "#5a6a85", textAlign: "right" }}>
                {status.latest.articles_processed.toLocaleString("da-DK")} artikler behandlet
                · {status.latest.authors_linked.toLocaleString("da-DK")} forfattere koblet
              </div>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => { void handleShowRejected(); }}
                style={{
                  padding: "8px 20px", borderRadius: "6px",
                  border: "1px solid #e5e7eb",
                  background: "#fff", color: "#1a1a1a",
                  fontWeight: 600, fontSize: "13px", cursor: "pointer",
                }}
              >
                Se afviste ({status?.rejectedAuthorsCount ?? 0})
              </button>
              <button
                onClick={() => { void handleStart(); }}
                disabled={isRunning || starting}
                style={{
                  padding: "8px 20px", borderRadius: "6px", border: "none",
                  background: isRunning || starting ? "#e5e7eb" : "#E83B2A",
                  color: isRunning || starting ? "#9ca3af" : "#fff",
                  fontWeight: 600, fontSize: "13px",
                  cursor: isRunning || starting ? "not-allowed" : "pointer",
                }}
              >
                {isRunning ? "Kører…" : starting ? "Starter…" : "Kør forfatter-import"}
              </button>
            </div>
            {actionError && (
              <div style={{ fontSize: "12px", color: "#b91c1c" }}>{actionError}</div>
            )}
          </div>
        </div>

        {/* Import overview table */}
        <div style={{
          background: "#fff",
          borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}>
          <div style={{
            background: "#EEF2F7",
            borderBottom: "1px solid #dde3ed",
            padding: "10px 24px",
          }}>
            <span style={{
              fontSize: "11px", letterSpacing: "0.08em",
              color: "#E83B2A", textTransform: "uppercase", fontWeight: 700,
            }}>
              Import-kørsler
            </span>
          </div>

          {overview == null ? (
            <div style={{ padding: "48px", textAlign: "center", fontSize: "13px", color: "#888" }}>
              Indlæser…
            </div>
          ) : overview.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center", fontSize: "13px", color: "#888" }}>
              Ingen import-kørsler endnu
            </div>
          ) : (() => {
            const withAccumulated = [...overview]
              .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())
              .reduce<(ImportOverviewRow & { accumulated: number })[]>((acc, row, i) => {
                const prev = acc[i - 1]?.accumulated ?? 0;
                return [...acc, { ...row, accumulated: prev + row.author_slots_imported }];
              }, [])
              .reverse();
            return (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Dato</th>
                  <th style={thStyle}>Filter</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Artikler importeret</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Afventer</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Akkumuleret</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Nye ✅</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Dubletter 🔄</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Afvist ❌</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {withAccumulated.map((row) => (
                  <tr key={row.id}>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#5a6a85" }}>
                      {fmt(row.started_at)}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {row.circle != null && (
                          <span style={{
                            fontSize: "10px", fontWeight: 700, padding: "1px 6px",
                            borderRadius: "999px", background: row.circle === 1 ? "#eff6ff" : "#f5f3ff",
                            color: row.circle === 1 ? "#1d4ed8" : "#7c3aed", border: "1px solid currentColor",
                          }}>
                            C{row.circle}
                          </span>
                        )}
                        <span style={{ color: row.filter_name ? "#1a1a1a" : "#bbb" }}>{row.filter_name ?? "—"}</span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {row.articles_imported.toLocaleString("da-DK")}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: row.unlinked_author_slots > 0 ? "#d97706" : "#bbb" }}>
                      {row.unlinked_author_slots > 0 ? row.unlinked_author_slots.toLocaleString("da-DK") : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                      {row.accumulated.toLocaleString("da-DK")}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: row.new_authors != null ? "#15803d" : "#bbb" }}>
                      {row.new_authors != null ? row.new_authors.toLocaleString("da-DK") : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: row.duplicates != null ? "#1d4ed8" : "#bbb" }}>
                      {row.duplicates != null ? row.duplicates.toLocaleString("da-DK") : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: row.rejected != null && row.rejected > 0 ? "#d97706" : "#bbb" }}>
                      {row.rejected != null && row.rejected > 0 ? row.rejected.toLocaleString("da-DK") : "—"}
                    </td>
                    <td style={tdStyle}>
                      <LinkingStatusBadge status={row.linking_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            );
          })()}
        </div>

        {showRejected && (
          <div style={{
            background: "#fff", borderRadius: "10px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
            overflow: "hidden", marginTop: "24px",
          }}>
            <div style={{
              background: "#EEF2F7", borderBottom: "1px solid #dde3ed",
              padding: "10px 24px", display: "flex",
              alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700 }}>
                Afviste forfattere
              </span>
              <button onClick={() => setShowRejected(false)} style={{ fontSize: "12px", color: "#888", background: "none", border: "none", cursor: "pointer" }}>
                Luk
              </button>
            </div>

            {loadingRejected ? (
              <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#888" }}>Indlæser…</div>
            ) : !rejectedRows?.length ? (
              <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#888" }}>Ingen afviste forfattere</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>PMID</th>
                    <th style={thStyle}>Artikel</th>
                    <th style={thStyle}>Position</th>
                    <th style={thStyle}>Navn i JSONB</th>
                    <th style={thStyle}>Affiliation</th>
                    <th style={thStyle}>Årsag</th>
                    <th style={thStyle}>Dato</th>
                  </tr>
                </thead>
                <tbody>
                  {rejectedRows.map((row) => (
                    <tr key={row.id}>
                      <td style={tdStyle}>{row.pubmed_id}</td>
                      <td style={{ ...tdStyle, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#5a6a85" }}>
                        {row.articles?.title ?? "—"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>{row.position ?? "—"}</td>
                      <td style={tdStyle}>
                        {[row.raw_data?.foreName, row.raw_data?.lastName].filter(Boolean).join(" ") || <span style={{ color: "#bbb" }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#5a6a85" }}>
                        {String(row.raw_data?.affiliation ?? "—")}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: "11px", color: "#d97706", fontWeight: 600 }}>
                          {row.reason}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: "#5a6a85", whiteSpace: "nowrap" }}>
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
