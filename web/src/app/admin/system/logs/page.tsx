"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Header from "@/components/Header";

interface ImportLog {
  id: string;
  filter_id: string | null;
  status: "running" | "completed" | "failed";
  articles_imported: number;
  articles_skipped: number;
  started_at: string;
  completed_at: string | null;
  errors: unknown;
  pubmed_filters: { name: string; specialty: string } | null;
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function duration(log: ImportLog): string {
  if (!log.completed_at) return "—";
  const ms = new Date(log.completed_at).getTime() - new Date(log.started_at).getTime();
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function StatusBadge({ status }: { status: ImportLog["status"] }) {
  const styles: Record<ImportLog["status"], React.CSSProperties> = {
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
      {status}
    </span>
  );
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

export default function LogsPage() {
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/import-logs?limit=50")
      .then((r) => r.json())
      .then((d: { ok: boolean; logs?: ImportLog[]; error?: string }) => {
        if (d.ok) {
          setLogs(d.logs ?? []);
        } else {
          setError(d.error ?? "Failed to load logs");
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Network error");
        setLoading(false);
      });
  }, []);

  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#f5f7fa",
      color: "#1a1a1a",
      minHeight: "100vh",
    }}>
      <Header />
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Back + Heading */}
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
            System · Logs
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "4px" }}>Import Logs</h1>
          <p style={{ fontSize: "13px", color: "#888" }}>
            All import runs across specialties — last 50 entries
          </p>
        </div>

        {/* Log table */}
        <div style={{
          background: "#fff",
          borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}>
          {loading ? (
            <div style={{ padding: "48px", textAlign: "center", fontSize: "13px", color: "#888" }}>
              Loading logs…
            </div>
          ) : error ? (
            <div style={{ padding: "48px", textAlign: "center", fontSize: "13px", color: "#b91c1c" }}>
              {error}
            </div>
          ) : logs.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center", fontSize: "13px", color: "#888" }}>
              No import runs yet
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Started</th>
                  <th style={thStyle}>Specialty</th>
                  <th style={thStyle}>Filter</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Imported</th>
                  <th style={thStyle}>Skipped</th>
                  <th style={thStyle}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ background: "#fff" }}>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#5a6a85" }}>
                      {fmt(log.started_at)}
                    </td>
                    <td style={{ ...tdStyle, color: "#5a6a85" }}>
                      {log.pubmed_filters?.specialty
                        ? <span style={{ textTransform: "capitalize" }}>{log.pubmed_filters.specialty}</span>
                        : <span style={{ color: "#bbb" }}>—</span>
                      }
                    </td>
                    <td style={tdStyle}>
                      {log.pubmed_filters?.name ?? (
                        <span style={{ color: "#bbb" }}>All filters</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <StatusBadge status={log.status} />
                    </td>
                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>
                      {log.articles_imported}
                    </td>
                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums", color: "#888" }}>
                      {log.articles_skipped}
                    </td>
                    <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums", color: "#888" }}>
                      {duration(log)}
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
