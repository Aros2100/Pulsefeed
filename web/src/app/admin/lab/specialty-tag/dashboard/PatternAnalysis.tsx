"use client";

import { useState } from "react";
import type { PatternAnalysisResult } from "@/app/api/lab/analyze-patterns/route";

interface Props {
  specialty: string;
  module: string;
}

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg className="animate-spin" style={{ width: size, height: size, flexShrink: 0 }} viewBox="0 0 24 24" fill="none">
      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ── Line-level diff (LCS) ─────────────────────────────────────────────────────

type DiffLine = { type: "unchanged" | "removed" | "added"; text: string };

function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const m = a.length;
  const n = b.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: "unchanged", text: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "added",   text: b[j - 1] }); j--;
    } else {
      result.unshift({ type: "removed", text: a[i - 1] }); i--;
    }
  }
  return result;
}

// ── PromptDiff ────────────────────────────────────────────────────────────────

function PromptDiff({ oldPrompt, newPrompt }: { oldPrompt: string; newPrompt: string }) {
  const lines = diffLines(oldPrompt, newPrompt);
  return (
    <div style={{
      border: "1px solid #e8ecf1", borderRadius: "8px", overflow: "auto",
      background: "#f8f9fb", fontFamily: "ui-monospace, 'Cascadia Code', monospace",
      fontSize: "12px", lineHeight: 1.7,
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {lines.map((line, i) => {
            const isRemoved = line.type === "removed";
            const isAdded   = line.type === "added";
            const bg     = isRemoved ? "#ffd7d5" : isAdded ? "#ccffd8" : "transparent";
            const color  = isRemoved ? "#9a1515"  : isAdded ? "#0f5c2e"  : "#2a2a2a";
            const prefix = isRemoved ? "−" : isAdded ? "+" : " ";
            return (
              <tr key={i}>
                <td style={{
                  width: "20px", padding: "0 8px", textAlign: "center",
                  color, fontWeight: 700, userSelect: "none" as const,
                  background: bg,
                  borderRight: "1px solid #e8ecf1",
                }}>
                  {prefix}
                </td>
                <td style={{
                  padding: "1px 14px", color, background: bg,
                  whiteSpace: "pre-wrap" as const,
                  wordBreak: "break-word" as const,
                  textDecoration: isRemoved ? "line-through" : "none",
                }}>
                  {line.text || " "}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PatternAnalysis({ specialty, module }: Props) {
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<PatternAnalysisResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res  = await fetch("/api/lab/analyze-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialty, module }),
      });
      const data = await res.json() as { ok: boolean; error?: string } & Partial<PatternAnalysisResult>;
      if (!data.ok) {
        setError(data.error ?? "Something went wrong");
      } else {
        setResult({
          false_positive_patterns: data.false_positive_patterns ?? [],
          false_negative_patterns: data.false_negative_patterns ?? [],
          recommended_changes:     data.recommended_changes     ?? "",
          improved_prompt:         data.improved_prompt         ?? "",
          current_prompt:          data.current_prompt          ?? "",
        });
      }
    } catch {
      setError("Netværksfejl — prøv igen");
    } finally {
      setLoading(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "8px",
  };

  return (
    <div style={{
      background: "#fff", borderRadius: "10px", marginBottom: "16px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        background: "#EEF2F7", borderBottom: "1px solid #dde3ed",
        padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase" as const, fontWeight: 700 }}>
          AI Mønsteranalyse
        </span>
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={loading}
          style={{
            fontSize: "12px", fontWeight: 700,
            background: loading ? "#f0f2f5" : "#1a1a1a",
            color: loading ? "#aaa" : "#fff",
            border: "none", borderRadius: "6px", padding: "5px 14px",
            cursor: loading ? "not-allowed" : "pointer",
            display: "inline-flex", alignItems: "center", gap: "6px",
          }}
        >
          {loading && <Spinner size={12} />}
          {loading ? "Analyserer…" : "Analyser mønstre"}
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: "20px 24px" }}>
        {!result && !error && !loading && (
          <p style={{ fontSize: "13px", color: "#aaa", margin: 0 }}>
            Klik "Analyser mønstre" for at identificere mønstre i AI/human-uenigheder og få et forbedret prompt-forslag.
          </p>
        )}

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#5a6a85", fontSize: "13px" }}>
            <Spinner size={16} />
            Claude analyserer mønstre på tværs af alle uenigheder…
          </div>
        )}

        {error && (
          <div style={{ fontSize: "13px", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "7px", padding: "10px 14px" }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            {/* False positive patterns — bullets, no background */}
            <div>
              <div style={labelStyle}>Fejlgodkendelser — AI for lempelig</div>
              <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {result.false_positive_patterns.map((p, i) => (
                  <li key={i} style={{ fontSize: "13px", color: "#2a2a2a", lineHeight: 1.5 }}>{p}</li>
                ))}
              </ul>
            </div>

            {/* False negative patterns — bullets, no background */}
            <div>
              <div style={labelStyle}>Fejlafvisninger — AI for streng</div>
              <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {result.false_negative_patterns.map((p, i) => (
                  <li key={i} style={{ fontSize: "13px", color: "#2a2a2a", lineHeight: 1.5 }}>{p}</li>
                ))}
              </ul>
            </div>

            {/* Recommended changes */}
            <div>
              <div style={labelStyle}>Anbefalede ændringer</div>
              <div style={{ fontSize: "13px", color: "#2a2a2a", lineHeight: 1.7, background: "#f8f9fb", border: "1px solid #e8ecf1", borderRadius: "8px", padding: "14px 16px", whiteSpace: "pre-wrap" }}>
                {result.recommended_changes}
              </div>
            </div>

            {/* Improved prompt — diff view */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <div style={labelStyle}>Forbedret prompt</div>
                <div style={{ display: "flex", gap: "12px", fontSize: "11px" }}>
                  <span style={{ color: "#b91c1c" }}>— fjernet</span>
                  <span style={{ color: "#15803d" }}>+ tilføjet</span>
                </div>
              </div>
              {result.current_prompt
                ? <PromptDiff oldPrompt={result.current_prompt} newPrompt={result.improved_prompt} />
                : (
                  <pre style={{
                    margin: 0, padding: "12px 14px",
                    border: "1px solid #e8ecf1", borderRadius: "8px",
                    background: "#f8f9fb",
                    fontFamily: "ui-monospace, 'Cascadia Code', monospace",
                    fontSize: "12px", lineHeight: 1.7, color: "#2a2a2a",
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {result.improved_prompt}
                  </pre>
                )
              }
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
