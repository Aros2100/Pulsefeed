"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Summary = {
  decidedPairs:   number;
  rankedArticles: number;
  topCategories:  { label: string; count: number }[];
  examplePairs:   number;
};

type Suggestion = {
  promptText:  string;
  changeNotes: string;
  summary:     Summary;
};

export default function GenerateV1Button() {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [creating,   setCreating]   = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [editText,   setEditText]   = useState("");
  const [editNotes,  setEditNotes]  = useState("");
  const [error,      setError]      = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    setSuggestion(null);
    try {
      const res = await fetch("/api/admin/lab/value-scoring/craft/prompt/generate-v1", { method: "POST" });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Generation failed");
      } else {
        const s = json as Suggestion & { ok: true };
        setSuggestion(s);
        setEditText(s.promptText);
        setEditNotes(s.changeNotes);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function confirm() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lab/value-scoring/craft/prompt/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptText:  editText,
          changeNotes: editNotes,
          // No parentPromptId — v1 starts a new chain
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Create failed");
        setCreating(false);
        return;
      }
      router.push(`/admin/lab/value-scoring/craft/prompt/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      setCreating(false);
    }
  }

  if (!suggestion) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "10px" }}>
        <button
          onClick={generate}
          disabled={generating}
          style={{
            background: generating ? "#fda99e" : "#E83B2A",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            padding: "10px 18px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: generating ? "default" : "pointer",
          }}
        >
          {generating ? "Analyzing pairs and reasoning…" : "Generate v1 from pairwise data"}
        </button>
        {error && <span style={{ fontSize: "12px", color: "#b91c1c" }}>{error}</span>}
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", borderRadius: "10px", border: "2px solid #E83B2A", padding: "20px 24px", marginTop: "20px" }}>
      <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "10px" }}>
        AI suggestion from {suggestion.summary.decidedPairs} pairs and {suggestion.summary.rankedArticles} ranked articles
      </div>

      {suggestion.summary.topCategories.length > 0 && (
        <div style={{ fontSize: "12px", color: "#5a6a85", marginBottom: "16px" }}>
          Top reason categories:{" "}
          {suggestion.summary.topCategories.slice(0, 6).map((c, i) => (
            <span key={c.label}>
              {i > 0 && " · "}
              <strong>{c.label}</strong> ({c.count}×)
            </span>
          ))}
        </div>
      )}

      <label style={{ display: "block", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5a6a85", marginBottom: "6px" }}>
        Change notes
      </label>
      <textarea
        value={editNotes}
        onChange={e => setEditNotes(e.target.value)}
        style={{
          width: "100%", minHeight: "80px", padding: "10px",
          fontSize: "13px", border: "1px solid #e5e7eb", borderRadius: "6px",
          resize: "vertical", color: "#1a1a1a", background: "#fff",
          marginBottom: "16px",
        }}
      />

      <label style={{ display: "block", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5a6a85", marginBottom: "6px" }}>
        Suggested prompt text
      </label>
      <textarea
        value={editText}
        onChange={e => setEditText(e.target.value)}
        style={{
          width: "100%", minHeight: "380px", padding: "12px",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: "13px", border: "1px solid #e5e7eb", borderRadius: "6px",
          resize: "vertical", color: "#1a1a1a", background: "#fff",
          marginBottom: "16px",
        }}
      />

      {error && (
        <div style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: "8px", padding: "8px 12px", marginBottom: "14px", fontSize: "13px", color: "#b91c1c" }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <button
          onClick={() => { setSuggestion(null); setError(null); }}
          disabled={creating}
          style={{
            background: "#fff", color: "#1a1a1a", border: "1px solid #e5e7eb",
            borderRadius: "6px", padding: "10px 16px",
            fontSize: "13px", fontWeight: 600,
            cursor: creating ? "default" : "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={confirm}
          disabled={creating || editText.trim().length === 0}
          style={{
            background: creating || editText.trim().length === 0 ? "#fda99e" : "#E83B2A",
            color: "#fff", border: "none",
            borderRadius: "6px", padding: "10px 18px",
            fontSize: "13px", fontWeight: 600,
            cursor: creating || editText.trim().length === 0 ? "default" : "pointer",
          }}
        >
          {creating ? "Creating…" : "Create v1 from this"}
        </button>
      </div>
    </div>
  );
}
