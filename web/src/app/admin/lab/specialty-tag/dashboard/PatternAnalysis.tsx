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
        });
      }
    } catch {
      setError("Netværksfejl — prøv igen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      background: "#fff", borderRadius: "10px", marginBottom: "16px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
      overflow: "hidden",
    }}>
      {/* Card header */}
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

      {/* Card body */}
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

            {/* False positive patterns */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "8px" }}>
                Fejlgodkendelser — AI for lempelig
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {result.false_positive_patterns.map((p, i) => (
                  <span key={i} style={{ fontSize: "12px", background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: "5px", padding: "4px 10px" }}>
                    {p}
                  </span>
                ))}
              </div>
            </div>

            {/* False negative patterns */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "8px" }}>
                Fejlafvisninger — AI for streng
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {result.false_negative_patterns.map((p, i) => (
                  <span key={i} style={{ fontSize: "12px", background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: "5px", padding: "4px 10px" }}>
                    {p}
                  </span>
                ))}
              </div>
            </div>

            {/* Recommended changes */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "8px" }}>
                Anbefalede ændringer
              </div>
              <div style={{ fontSize: "13px", color: "#2a2a2a", lineHeight: 1.7, background: "#f8f9fb", border: "1px solid #e8ecf1", borderRadius: "8px", padding: "14px 16px", whiteSpace: "pre-wrap" }}>
                {result.recommended_changes}
              </div>
            </div>

            {/* Improved prompt */}
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "8px" }}>
                Forbedret prompt
              </div>
              <textarea
                readOnly
                value={result.improved_prompt}
                rows={14}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "12px 14px",
                  border: "1px solid #e8ecf1", borderRadius: "8px",
                  background: "#f8f9fb",
                  fontFamily: "ui-monospace, 'Cascadia Code', monospace",
                  fontSize: "12px", lineHeight: 1.7, color: "#2a2a2a",
                  resize: "vertical",
                }}
              />
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
