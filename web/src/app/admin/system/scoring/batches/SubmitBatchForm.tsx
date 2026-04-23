"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

const btnBase: React.CSSProperties = {
  padding: "10px 20px",
  fontSize: "13px",
  fontWeight: 600,
  borderRadius: "6px",
  border: "none",
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: "13px",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  background: "#fff",
  color: "#1a1a1a",
};

export function SubmitBatchForm({
  pendingCount,
  apiRoute = "/api/scoring/batch/specialty/submit",
}: {
  pendingCount: number;
  apiRoute?: string;
}) {
  const router = useRouter();
  const [edatFrom, setEdatFrom] = useState("");
  const [edatTo, setEdatTo]     = useState("");
  const [limit, setLimit]       = useState<number>(Math.min(pendingCount, 10000));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { specialty: ACTIVE_SPECIALTY, limit };
      if (edatFrom) body.edat_from = edatFrom;
      if (edatTo)   body.edat_to   = edatTo;

      const res = await fetch(apiRoute, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      if (!json.batchId) {
        setError("No articles to score in this range.");
        return;
      }
      router.push(`/admin/system/scoring/batches/${json.batchId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = pendingCount > 0 && !submitting;

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* EDAT filters */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
        <label style={{ fontSize: "13px", color: "#5a6a85" }}>From:</label>
        <input type="date" value={edatFrom} disabled={submitting}
          onChange={(e) => setEdatFrom(e.target.value)} style={inputStyle} />
        <label style={{ fontSize: "13px", color: "#5a6a85" }}>To:</label>
        <input type="date" value={edatTo} disabled={submitting}
          onChange={(e) => setEdatTo(e.target.value)} style={inputStyle} />
      </div>

      {/* Limit + submit */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label style={{ fontSize: "13px", color: "#5a6a85" }}>Limit:</label>
          <input
            type="number" min={1} max={10000}
            value={limit} disabled={submitting}
            onChange={(e) => setLimit(Math.min(10000, Math.max(1, parseInt(e.target.value) || 1)))}
            style={{ ...inputStyle, width: "90px", textAlign: "right" }}
          />
          <span style={{ fontSize: "12px", color: "#888" }}>/ {pendingCount.toLocaleString("en-US")} pending</span>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            ...btnBase,
            background: canSubmit ? "#E83B2A" : "#e5e7eb",
            color: canSubmit ? "#fff" : "#9ca3af",
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {submitting ? "Submitting…" : "Submit batch"}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: "12px", fontSize: "13px", color: "#b91c1c" }}>
          {error}
        </div>
      )}

      {pendingCount === 0 && (
        <div style={{ marginTop: "12px", fontSize: "13px", color: "#15803d", fontWeight: 600 }}>
          No pending articles.
        </div>
      )}
    </div>
  );
}
