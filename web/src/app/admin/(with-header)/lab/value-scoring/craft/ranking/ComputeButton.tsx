"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Summary = {
  articleCount: number;
  decidedPairs: number;
  iterations: number;
  converged: boolean;
  durationMs: number;
  betaMin: number;
  betaMax: number;
};

export default function ComputeButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lab/value-scoring/craft/ranking/compute", { method: "POST" });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Compute failed");
      } else {
        setSummary(json.summary as Summary);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Compute failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
      <button
        onClick={run}
        disabled={busy}
        style={{
          background: busy ? "#fda99e" : "#E83B2A",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          padding: "8px 14px",
          fontSize: "13px",
          fontWeight: 600,
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "Computing…" : "Compute Bradley-Terry ranking"}
      </button>
      {summary && !error && (
        <div style={{ fontSize: "12px", color: "#5a6a85" }}>
          Computed for {summary.articleCount} articles based on {summary.decidedPairs} decided pairs ·
          {" "}{summary.iterations} iter{summary.converged ? "" : " (no convergence)"} ·
          {" "}{(summary.durationMs / 1000).toFixed(2)}s ·
          {" "}β range [{summary.betaMin.toFixed(2)}, {summary.betaMax.toFixed(2)}]
        </div>
      )}
      {error && (
        <div style={{ fontSize: "12px", color: "#b91c1c" }}>{error}</div>
      )}
    </div>
  );
}
