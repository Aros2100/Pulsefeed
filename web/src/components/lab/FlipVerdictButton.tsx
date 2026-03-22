"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FlipVerdictButton({
  decisionId,
  articleId,
  currentVerdict,
  specialty,
}: {
  decisionId:     string;
  articleId:      string;
  currentVerdict: string;
  specialty:      string;
}) {
  const router   = useRouter();
  const [busy, setBusy]   = useState(false);
  const [done, setDone]   = useState(false);
  const newVerdict = currentVerdict === "approved" ? "rejected" : "approved";
  const label      = newVerdict === "approved" ? "Skift til godkendt" : "Skift til afvist";

  async function handleFlip() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/lab/flip-verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision_id: decisionId, article_id: articleId, new_verdict: newVerdict, specialty }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { alert(data.error ?? "Fejl"); return; }
      setDone(true);
      setTimeout(() => router.refresh(), 800);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <span style={{ fontSize: "11px", color: "#15803d", fontWeight: 600 }}>✓ Ændret</span>
    );
  }

  return (
    <button
      onClick={() => void handleFlip()}
      disabled={busy}
      style={{
        fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "6px",
        border: "1px solid #dde3ed", background: busy ? "#f1f3f7" : "#fff",
        color: busy ? "#94a3b8" : "#5a6a85", cursor: busy ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {busy ? "…" : `↩ ${label}`}
    </button>
  );
}
