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

interface StatusResponse {
  ok: boolean;
  latest: AuthorLinkingLog | null;
  logs: AuthorLinkingLog[];
  unlinkedCount: number;
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

function duration(log: AuthorLinkingLog): string {
  if (!log.completed_at) return "—";
  const ms = new Date(log.completed_at).getTime() - new Date(log.started_at).getTime();
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
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

function StatusBadge({ status }: { status: AuthorLinkingLog["status"] }) {
  const styles: Record<AuthorLinkingLog["status"], React.CSSProperties> = {
    running:   { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" },
    completed: { background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" },
    failed:    { background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" },
  };
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      borderRadius: "999px",
      padding: "2px 8px",
      fontSize: "11px",
      fontWeight: 600,
      ...styles[status],
    }}>
      {status === "running" && (
        <span style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: "#3b82f6",
          animation: "pulse 1.5s infinite",
        }} />
      )}
      {status === "running" ? "Kører…" : status === "completed" ? "Færdig" : "Fejlet"}
    </span>
  );
}

export default function AuthorLinkingPage() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/author-linking/status");
      const json = (await res.json()) as StatusResponse;
      console.log("[author-linking] status response:", JSON.stringify(json, null, 2));
      if (json.ok) setData(json);
    } catch (e) {
      console.error("[author-linking] fetchStatus error:", e);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const isRunning = data?.latest?.status === "running";

  // Poll every 3s while running; interval is owned by the effect and cleaned up automatically
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => { void fetchStatus(); }, 3000);
    return () => clearInterval(id);
  }, [isRunning, fetchStatus]);

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/author-linking/start", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "Ukendt fejl");
      } else {
        await fetchStatus();
      }
    } catch {
      setError("Netværksfejl");
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
            fontSize: "11px",
            letterSpacing: "0.08em",
            color: "#E83B2A",
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: "6px",
          }}>
            System · Forfattere
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "4px" }}>Forfatter-import</h1>
          <p style={{ fontSize: "13px", color: "#888" }}>
            Kobler forfatter-JSONB til article_authors-tabellen for alle artikler der mangler det
          </p>
        </div>

        {/* Status card */}
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
          <div>
            <div style={{ fontSize: "13px", color: "#5a6a85", marginBottom: "4px" }}>
              Artikler uden forfattere
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {data == null ? "—" : data.unlinkedCount.toLocaleString("da-DK")}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
            {isRunning && data?.latest && (
              <div style={{ fontSize: "13px", color: "#5a6a85", textAlign: "right" }}>
                {data.latest.articles_processed.toLocaleString("da-DK")} artikler behandlet
                · {data.latest.authors_linked.toLocaleString("da-DK")} forfattere koblet
              </div>
            )}
            <button
              onClick={() => { void handleStart(); }}
              disabled={isRunning || starting}
              style={{
                padding: "8px 20px",
                borderRadius: "6px",
                border: "none",
                background: isRunning || starting ? "#e5e7eb" : "#E83B2A",
                color: isRunning || starting ? "#9ca3af" : "#fff",
                fontWeight: 600,
                fontSize: "13px",
                cursor: isRunning || starting ? "not-allowed" : "pointer",
              }}
            >
              {isRunning ? "Kører…" : starting ? "Starter…" : "Kør forfatter-import"}
            </button>
            {error && (
              <div style={{ fontSize: "12px", color: "#b91c1c" }}>{error}</div>
            )}
          </div>
        </div>

        {/* Logs table */}
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
              fontSize: "11px",
              letterSpacing: "0.08em",
              color: "#E83B2A",
              textTransform: "uppercase",
              fontWeight: 700,
            }}>
              Seneste kørsler
            </span>
          </div>

          {!data ? (
            <div style={{ padding: "48px", textAlign: "center", fontSize: "13px", color: "#888" }}>
              Indlæser…
            </div>
          ) : data.logs.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center", fontSize: "13px", color: "#888" }}>
              Ingen kørsler endnu
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Startet</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Artikler</th>
                  <th style={thStyle}>Forfattere koblet</th>
                  <th style={thStyle}>Varighed</th>
                  <th style={thStyle}>Fejl</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#5a6a85" }}>
                      {fmt(log.started_at)}
                    </td>
                    <td style={tdStyle}>
                      <StatusBadge status={log.status} />
                    </td>
                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>
                      {log.articles_processed}
                    </td>
                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>
                      {log.authors_linked}
                    </td>
                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums", color: "#888" }}>
                      {duration(log)}
                    </td>
                    <td style={{ ...tdStyle, color: log.errors?.length > 0 ? "#b91c1c" : "#bbb" }}>
                      {log.errors?.length > 0 ? `${log.errors.length} fejl` : "—"}
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
