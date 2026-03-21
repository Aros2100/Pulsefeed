"use client";

import Link from "next/link";
import { useState } from "react";
import type { PatternAnalysisResult } from "@/app/api/lab/analyze-patterns/route";

// ── Exported types ─────────────────────────────────────────────────────────────

export interface OptimizationRun {
  id: string;
  base_version: string;
  total_decisions: number | null;
  fp_count: number | null;
  fn_count: number | null;
  fp_patterns: string[];
  fn_patterns: string[];
  recommended_changes: string | null;
  improved_prompt: string | null;
  created_at: string;
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  specialty: string;
  module: string;
  initialRun?: OptimizationRun | null;
  disabled?: boolean;
  accentColor?: string;    // default: "#E83B2A"
  threshold?: number;      // default: 50
  simulatePath?: string;   // default: "/admin/lab/specialty-tag/simulate"
  placeholder?: string;    // default: specialty-tag placeholder text
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function runToResult(run: OptimizationRun): PatternAnalysisResult {
  return {
    false_positive_patterns: run.fp_patterns ?? [],
    false_negative_patterns: run.fn_patterns ?? [],
    recommended_changes:     run.recommended_changes ?? "",
    improved_prompt:         run.improved_prompt ?? "",
    current_prompt:          "",
    run_id:                  run.id,
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("da-DK", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ── Line-level diff (LCS) ─────────────────────────────────────────────────────

type DiffLine = { type: "unchanged" | "removed" | "added"; text: string };

function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const m = a.length;
  const n = b.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

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

// ── Sub-components ────────────────────────────────────────────────────────────

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg className="animate-spin" style={{ width: size, height: size, flexShrink: 0 }} viewBox="0 0 24 24" fill="none">
      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

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
          {lines.map((line, idx) => {
            const isRemoved = line.type === "removed";
            const isAdded   = line.type === "added";
            const bg     = isRemoved ? "#ffd7d5" : isAdded ? "#ccffd8" : "transparent";
            const color  = isRemoved ? "#9a1515"  : isAdded ? "#0f5c2e"  : "#2a2a2a";
            const prefix = isRemoved ? "−" : isAdded ? "+" : " ";
            return (
              <tr key={idx}>
                <td style={{
                  width: "20px", padding: "0 8px", textAlign: "center",
                  color, fontWeight: 700, userSelect: "none" as const,
                  background: bg, borderRight: "1px solid #e8ecf1",
                }}>
                  {prefix}
                </td>
                <td style={{
                  padding: "1px 14px", color, background: bg,
                  whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const,
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function PatternAnalysis({
  specialty,
  module,
  initialRun,
  disabled,
  accentColor  = "#E83B2A",
  threshold    = 50,
  simulatePath = "/admin/lab/specialty-tag/simulate",
  placeholder  = "Fx: 'Godkend TBI-artikler selvom de ikke er kirurgiske' eller 'Vær strengere på ren neurologi'",
}: Props) {
  const [loading,      setLoading]      = useState(false);
  const [result,       setResult]       = useState<PatternAnalysisResult | null>(
    initialRun ? runToResult(initialRun) : null
  );
  const [savedRun,     setSavedRun]     = useState<OptimizationRun | null>(initialRun ?? null);
  const [runId,        setRunId]        = useState<string | null>(initialRun?.id ?? null);
  const [error,        setError]        = useState<string | null>(null);
  const [feedback,     setFeedback]     = useState("");
  const [refining,     setRefining]     = useState(false);
  const [refineError,  setRefineError]  = useState<string | null>(null);

  const isDisabled = disabled || loading;
  const totalDisagreements = savedRun
    ? (savedRun.fp_count ?? 0) + (savedRun.fn_count ?? 0)
    : null;

  async function handleAnalyze() {
    if (disabled) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSavedRun(null);
    setRunId(null);
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
          run_id:                  data.run_id                  ?? null,
        });
        setRunId(data.run_id ?? null);
      }
    } catch {
      setError("Netværksfejl — prøv igen");
    } finally {
      setLoading(false);
    }
  }

  async function handleRefine() {
    if (!result || !feedback.trim()) return;
    setRefining(true);
    setRefineError(null);
    try {
      const res  = await fetch("/api/lab/refine-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_prompt: result.improved_prompt,
          feedback:       feedback.trim(),
          fp_patterns:    result.false_positive_patterns,
          fn_patterns:    result.false_negative_patterns,
          specialty,
          run_id:         runId,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string; refined_prompt?: string };
      if (!data.ok) {
        setRefineError(data.error ?? "Something went wrong");
      } else {
        setResult((prev) => prev ? { ...prev, improved_prompt: data.refined_prompt ?? prev.improved_prompt } : prev);
        setFeedback("");
      }
    } catch {
      setRefineError("Netværksfejl — prøv igen");
    } finally {
      setRefining(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "8px",
  };

  return (
    <div style={{
      background: "#fff", borderRadius: "10px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        background: "#EEF2F7", borderBottom: "1px solid #dde3ed",
        padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: accentColor, textTransform: "uppercase" as const, fontWeight: 700 }}>
            AI Mønsteranalyse · Step 2
          </span>
          {savedRun && (
            <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>
              Analyseret {formatDate(savedRun.created_at)} · Baseret på {totalDisagreements} uenigheder · {savedRun.base_version}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={isDisabled}
          title={disabled ? `Utilstrækkelig data — kræver mindst ${threshold} uenigheder` : undefined}
          style={{
            fontSize: "12px", fontWeight: 700,
            background: isDisabled ? "#f0f2f5" : "#1a1a1a",
            color:      isDisabled ? "#aaa"    : "#fff",
            border: "none", borderRadius: "6px", padding: "5px 14px",
            cursor: isDisabled ? "not-allowed" : "pointer",
            display: "inline-flex", alignItems: "center", gap: "6px",
          }}
        >
          {loading && <Spinner size={12} />}
          {loading ? "Analyserer…" : "Kør ny analyse"}
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: "20px 24px" }}>
        {!result && !error && !loading && (
          <p style={{ fontSize: "13px", color: "#aaa", margin: 0 }}>
            {disabled
              ? `Utilstrækkelig data — kræver mindst ${threshold} uenigheder for at køre mønsteranalyse.`
              : "Ingen analyse endnu — klik \"Kør ny analyse\" for at identificere mønstre i AI/human-uenigheder og få et forbedret prompt-forslag."
            }
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

            <div>
              <div style={labelStyle}>Fejlgodkendelser — AI for lempelig</div>
              <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {result.false_positive_patterns.map((p, i) => (
                  <li key={i} style={{ fontSize: "13px", color: "#2a2a2a", lineHeight: 1.5 }}>{p}</li>
                ))}
              </ul>
            </div>

            <div>
              <div style={labelStyle}>Fejlafvisninger — AI for streng</div>
              <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {result.false_negative_patterns.map((p, i) => (
                  <li key={i} style={{ fontSize: "13px", color: "#2a2a2a", lineHeight: 1.5 }}>{p}</li>
                ))}
              </ul>
            </div>

            <div>
              <div style={labelStyle}>Anbefalede ændringer</div>
              <div style={{ fontSize: "13px", color: "#2a2a2a", lineHeight: 1.7, background: "#f8f9fb", border: "1px solid #e8ecf1", borderRadius: "8px", padding: "14px 16px", whiteSpace: "pre-wrap" }}>
                {result.recommended_changes}
              </div>
            </div>

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
                    border: "1px solid #e8ecf1", borderRadius: "8px", background: "#f8f9fb",
                    fontFamily: "ui-monospace, 'Cascadia Code', monospace",
                    fontSize: "12px", lineHeight: 1.7, color: "#2a2a2a",
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {result.improved_prompt}
                  </pre>
                )
              }
            </div>

            {/* Iterative refinement */}
            <div style={{ borderTop: "1px solid #f0f2f5", paddingTop: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={labelStyle}>Din feedback til prompten</div>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={placeholder}
                rows={3}
                style={{
                  width: "100%", boxSizing: "border-box",
                  fontSize: "13px", color: "#1a1a1a", lineHeight: 1.6,
                  border: "1px solid #dde3ed", borderRadius: "8px",
                  padding: "10px 12px", resize: "vertical",
                  fontFamily: "var(--font-inter), Inter, sans-serif",
                  outline: "none",
                }}
              />
              {refineError && (
                <div style={{ fontSize: "12px", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "6px", padding: "8px 12px" }}>
                  {refineError}
                </div>
              )}
              <div>
                <button
                  type="button"
                  onClick={handleRefine}
                  disabled={refining || !feedback.trim()}
                  style={{
                    fontSize: "12px", fontWeight: 700,
                    background: refining || !feedback.trim() ? "#f0f2f5" : "#1a1a1a",
                    color:      refining || !feedback.trim() ? "#aaa"    : "#fff",
                    border: "none", borderRadius: "6px", padding: "7px 16px",
                    cursor: refining || !feedback.trim() ? "not-allowed" : "pointer",
                    display: "inline-flex", alignItems: "center", gap: "6px",
                  }}
                >
                  {refining && <Spinner size={12} />}
                  {refining ? "Forfiner…" : "Forfin prompt med feedback"}
                </button>
              </div>
            </div>

            {/* Navigate to simulator */}
            {runId && (
              <div style={{ paddingTop: "4px", borderTop: "1px solid #f0f2f5" }}>
                <Link
                  href={`${simulatePath}?run_id=${runId}`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "6px",
                    fontSize: "13px", fontWeight: 700,
                    background: "#1a1a1a", color: "#fff",
                    borderRadius: "7px", padding: "8px 16px",
                    textDecoration: "none",
                  }}
                >
                  Kør simulation →
                </Link>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
