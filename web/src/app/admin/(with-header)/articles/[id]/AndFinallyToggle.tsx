"use client";
import { useState } from "react";

interface Props {
  articleId: string;
  initialCandidate: boolean;
  isUsed: boolean;
  usedInEdition: { week_number: number; year: number } | null;
}

export default function AndFinallyToggle({ articleId, initialCandidate, isUsed, usedInEdition }: Props) {
  const [candidate, setCandidate] = useState(initialCandidate);
  const [loading, setLoading] = useState(false);

  const tooltip = isUsed && usedInEdition
    ? `Used in Week ${usedInEdition.week_number} · ${usedInEdition.year}`
    : candidate
    ? "Remove from And finally pool"
    : "Mark for And finally";

  async function toggle() {
    if (isUsed || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/articles/${articleId}/and-finally-toggle`, { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        setCandidate(json.and_finally_candidate);
      } else {
        alert(json.error ?? "Toggle failed");
      }
    } catch {
      alert("Toggle failed");
    } finally {
      setLoading(false);
    }
  }

  if (isUsed) {
    return (
      <button
        disabled
        title={tooltip}
        style={{
          fontSize: "11px", fontWeight: 600, fontFamily: "inherit",
          padding: "4px 10px", borderRadius: "5px",
          border: "1px solid #e5e7eb",
          background: "#f9fafb", color: "#9ca3af",
          cursor: "default",
        }}
      >
        Used in newsletter
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={tooltip}
      style={{
        fontSize: "11px", fontWeight: 600, fontFamily: "inherit",
        padding: "4px 10px", borderRadius: "5px",
        border: candidate ? "1px solid #E83B2A" : "1px solid #e2e8f0",
        background: candidate ? "#fff5f4" : "none",
        color: candidate ? "#E83B2A" : "#5a6a85",
        cursor: loading ? "default" : "pointer",
        opacity: loading ? 0.6 : 1,
        transition: "all 0.15s",
      }}
    >
      {candidate ? "✓ Marked for And finally" : "Mark for And finally"}
    </button>
  );
}
