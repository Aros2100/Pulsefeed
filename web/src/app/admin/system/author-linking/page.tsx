"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Header from "@/components/Header";

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
  trigger: string | null;
  filter_name: string | null;
  circle: number | null;
  authors_linked: number | null;
  linking_status: string | null;
}

interface StatusResponse {
  ok: boolean;
  latest: AuthorLinkingLog | null;
  unlinkedCount: number;
  unlinkedAuthorSlots: number;
  totalAuthors: number;
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

  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#f5f7fa",
      color: "#1a1a1a",
      minHeight: "100vh",
    }}>
      <Header />
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
          <div style={{ display: "flex", gap: "40px" }}>
            <div>
              <div style={{ fontSize: "13px", color: "#5a6a85", marginBottom: "4px" }}>
                Artikler uden forfattere
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {status == null ? "—" : status.unlinkedCount.toLocaleString("da-DK")}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "13px", color: "#5a6a85", marginBottom: "4px" }}>
                Forfatter-slots i kø
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {status == null ? "—" : status.unlinkedAuthorSlots.toLocaleString("da-DK")}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "13px", color: "#5a6a85", marginBottom: "4px" }}>
                Forfattere i DB
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {status == null ? "—" : status.totalAuthors.toLocaleString("da-DK")}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
            {isRunning && status?.latest && (
              <div style={{ fontSize: "13px", color: "#5a6a85", textAlign: "right" }}>
                {status.latest.articles_processed.toLocaleString("da-DK")} artikler behandlet
                · {status.latest.authors_linked.toLocaleString("da-DK")} forfattere koblet
              </div>
            )}
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
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Dato</th>
                  <th style={thStyle}>Cirkel</th>
                  <th style={thStyle}>Filter</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Artikler importeret</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Forfattere linket</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {overview.map((row) => (
                  <tr key={row.id}>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#5a6a85" }}>
                      {fmt(row.started_at)}
                    </td>
                    <td style={{ ...tdStyle, color: "#5a6a85" }}>
                      {row.circle != null ? `C${row.circle}` : "—"}
                    </td>
                    <td style={{ ...tdStyle, color: row.filter_name ? "#1a1a1a" : "#bbb" }}>
                      {row.filter_name ?? "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {row.articles_imported.toLocaleString("da-DK")}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: row.authors_linked != null ? "#1a1a1a" : "#bbb" }}>
                      {row.authors_linked != null ? row.authors_linked.toLocaleString("da-DK") : "—"}
                    </td>
                    <td style={tdStyle}>
                      <LinkingStatusBadge status={row.linking_status} />
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
