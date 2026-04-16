"use client";

import { useState } from "react";
import Link from "next/link";

interface CandidateAuthor {
  id: string;
  display_name: string | null;
  country: string | null;
  city: string | null;
  article_count: number | null;
}

const card: React.CSSProperties = {
  background: "#fff", borderRadius: "10px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
  overflow: "hidden", marginBottom: "0",
};

export default function MergeCheck() {
  const [status, setStatus]         = useState<"idle" | "loading" | "done">("idle");
  const [candidates, setCandidates] = useState<CandidateAuthor[]>([]);
  const [error, setError]           = useState<string | null>(null);

  async function check() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/user/author-merge/candidates");
      const data = await res.json() as { ok: boolean; candidates?: CandidateAuthor[]; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Request failed");
      setCandidates(data.candidates ?? []);
      setStatus("done");
    } catch {
      setError("Something went wrong. Try again.");
      setStatus("idle");
    }
  }

  if (status === "idle") {
    return (
      <div>
        <button
          type="button"
          onClick={() => { void check(); }}
          style={{
            fontSize: "13px", fontWeight: 600, color: "#4f46e5",
            background: "none", border: "1px solid #c7d2fe",
            borderRadius: "6px", padding: "6px 14px",
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Check for duplicate profiles
        </button>
        {error && (
          <div style={{ fontSize: "13px", color: "#dc2626", marginTop: "8px" }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#888" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" style={{ animation: "spin 0.8s linear infinite" }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <circle cx="12" cy="12" r="10" stroke="#c7d2fe" strokeWidth="3" fill="none" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#4f46e5" strokeWidth="3" fill="none" strokeLinecap="round" />
        </svg>
        Checking…
      </div>
    );
  }

  // status === "done"
  if (candidates.length === 0) {
    return (
      <div style={{ fontSize: "13px", color: "#888" }}>
        No duplicate profiles found.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {candidates.map((c) => (
        <div key={c.id} style={{ ...card, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>
              {c.display_name ?? "—"}
            </div>
            <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
              {[c.city, c.country].filter(Boolean).join(", ")}
              {c.article_count != null ? ` · ${c.article_count} publikationer` : ""}
            </div>
          </div>
          <Link
            href={`/profile/merge?candidate=${c.id}`}
            style={{ fontSize: "13px", color: "#4f46e5", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}
          >
            Se og sammenlæg →
          </Link>
        </div>
      ))}
    </div>
  );
}
