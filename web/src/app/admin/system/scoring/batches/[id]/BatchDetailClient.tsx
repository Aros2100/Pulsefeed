"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const btnBase: React.CSSProperties = {
  padding: "10px 20px",
  fontSize: "13px",
  fontWeight: 600,
  borderRadius: "6px",
  border: "none",
  cursor: "pointer",
};

type Stats = {
  scored?: number;
  approved?: number;
  rejected?: number;
  failed?: number;
  failed_ids?: string[];
};

export function BatchDetailClient({
  id,
  module,
  status,
  ingestedAt,
  stats,
}: {
  id: string;
  module: string;
  status: string;
  ingestedAt: string | null;
  stats: Stats | null;
}) {
  const router = useRouter();
  const [polling, setPolling]   = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [liveStats, setLiveStats] = useState<Stats | null>(stats);
  const [liveStatus, setLiveStatus] = useState(status);

  async function handlePoll() {
    setPolling(true);
    setError(null);
    try {
      const res = await fetch(`/api/scoring/batch/${id}/poll`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) { setError(json.error ?? `HTTP ${res.status}`); return; }
      // Refresh to get updated server state
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPolling(false);
    }
  }

  async function handleIngest() {
    setIngesting(true);
    setError(null);
    try {
      const res = await fetch(`/api/scoring/batch/${id}/ingest`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) { setError(json.error ?? `HTTP ${res.status}`); return; }
      setLiveStats(json.stats);
      setLiveStatus("ingested");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIngesting(false);
    }
  }

  const canIngest = liveStatus === "ended" && !ingestedAt;

  return (
    <div>
      {/* Actions card */}
      <div style={{
        background: "#fff", borderRadius: "10px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
        overflow: "hidden", marginBottom: "24px",
      }}>
        <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 20px" }}>
          <span style={{ fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, color: "#5a6a85" }}>
            Actions
          </span>
        </div>
        <div style={{ padding: "20px 24px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={handlePoll}
            disabled={polling}
            style={{ ...btnBase, background: polling ? "#e5e7eb" : "#1a1a1a", color: polling ? "#9ca3af" : "#fff", cursor: polling ? "not-allowed" : "pointer" }}
          >
            {polling ? "Refreshing…" : "Refresh status"}
          </button>

          {canIngest && (
            <button
              onClick={handleIngest}
              disabled={ingesting}
              style={{ ...btnBase, background: ingesting ? "#e5e7eb" : "#E83B2A", color: ingesting ? "#9ca3af" : "#fff", cursor: ingesting ? "not-allowed" : "pointer" }}
            >
              {ingesting ? "Ingesting…" : "Ingest results"}
            </button>
          )}

          {error && <span style={{ fontSize: "13px", color: "#b91c1c" }}>{error}</span>}
        </div>
      </div>

      {/* Stats card — shown when ended or ingested */}
      {(liveStatus === "ended" || liveStatus === "ingested") && liveStats && (
        <div style={{
          background: "#fff", borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          overflow: "hidden", marginBottom: "24px",
        }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 20px" }}>
            <span style={{ fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, color: "#5a6a85" }}>
              Stats
            </span>
          </div>
          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", gap: "32px", marginBottom: "16px", flexWrap: "wrap" }}>
              {(module === "subspecialty"
                ? [
                    { label: "Scored", value: liveStats.scored, color: "#1a1a1a" },
                    { label: "Failed", value: liveStats.failed, color: "#b91c1c" },
                  ]
                : [
                    { label: "Scored",   value: liveStats.scored,    color: "#1a1a1a" },
                    { label: "Approved", value: liveStats.approved,   color: "#15803d" },
                    { label: "Rejected", value: liveStats.rejected,   color: "#d97706" },
                    { label: "Failed",   value: liveStats.failed,     color: "#b91c1c" },
                  ]
              ).map(({ label, value, color }) => (
                <div key={label}>
                  <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{label}</div>
                  <div style={{ fontSize: "28px", fontWeight: 800, color }}>{value ?? "—"}</div>
                </div>
              ))}
            </div>

            {/* Failed article IDs */}
            {(liveStats.failed_ids?.length ?? 0) > 0 && (
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#b91c1c", marginBottom: "8px" }}>
                  Failed article IDs
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {liveStats.failed_ids!.map((aid) => (
                    <a key={aid} href={`/admin/articles/${aid}`}
                      style={{ fontSize: "12px", color: "#E83B2A", fontFamily: "monospace", textDecoration: "none" }}>
                      {aid}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
