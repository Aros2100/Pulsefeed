"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GeoBackfillActions() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    ok?: boolean;
    runId?: string;
    previewed?: number;
    errors?: string[];
    error?: string;
  } | null>(null);

  async function handleRun() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/geo-backfill/dry-run", { method: "POST" });
      const json = await res.json();
      setResult(json);
      if (json.ok) router.refresh();
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleRun}
        disabled={running}
        style={{
          padding: "9px 20px",
          background: running ? "#9ca3af" : "#E83B2A",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          fontSize: "13px",
          fontWeight: 700,
          cursor: running ? "not-allowed" : "pointer",
        }}
      >
        {running ? "Kører…" : "Kør dry-run på 200 artikler"}
      </button>

      {result && (
        <div style={{ marginTop: "16px" }}>
          {result.ok === false || result.error ? (
            <div style={{
              background: "#fef2f2", border: "1px solid #fca5a5",
              borderRadius: "6px", padding: "12px 16px", fontSize: "13px", color: "#b91c1c",
            }}>
              Fejl: {result.error ?? "Ukendt fejl"}
            </div>
          ) : (
            <div style={{
              background: "#f0fdf4", border: "1px solid #86efac",
              borderRadius: "6px", padding: "12px 16px", fontSize: "13px", color: "#15803d",
            }}>
              <strong>Kørsel afsluttet.</strong>{" "}
              {result.previewed} artikler previewed (run_id: <code style={{ fontSize: "12px" }}>{result.runId}</code>).
              {result.errors && result.errors.length > 0 && (
                <div style={{ marginTop: "8px", color: "#d97706" }}>
                  {result.errors.length} fejl — første: {result.errors[0]}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
