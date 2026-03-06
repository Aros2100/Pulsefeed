"use client";

import { useState } from "react";
import type { PatternAnalysisResult } from "@/app/api/lab/analyze-patterns/route";

// ── Exported types ─────────────────────────────────────────────────────────────

export interface OptimizationRun {
  id: string;
  base_version: string;
  base_prompt_text: string | null;
  total_decisions: number | null;
  fp_count: number | null;
  fn_count: number | null;
  fp_patterns: string[];
  fn_patterns: string[];
  recommended_changes: string | null;
  improved_prompt: string | null;
  created_at: string;
}

export interface DisagreementEntry {
  article_id: string;
  title: string;
  human_decision: string;
  old_ai_decision: string;
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  specialty: string;
  module: string;
  initialRun?: OptimizationRun | null;
  disabled?: boolean;
  disagreements?: DisagreementEntry[];
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function runToResult(run: OptimizationRun): PatternAnalysisResult {
  return {
    false_positive_patterns: run.fp_patterns ?? [],
    false_negative_patterns: run.fn_patterns ?? [],
    recommended_changes:     run.recommended_changes ?? "",
    improved_prompt:         run.improved_prompt ?? "",
    current_prompt:          run.base_prompt_text ?? "",
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("da-DK", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n) + "…" : str;
}

async function consumeSSE(
  url: string,
  body: object,
  onEvent: (data: Record<string, unknown>) => void
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      for (const line of part.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try { onEvent(JSON.parse(line.slice(6)) as Record<string, unknown>); }
        catch { /* ignore malformed */ }
      }
    }
  }
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

function DecisionBadge({ decision }: { decision: string }) {
  const isApproved = decision === "approved";
  return (
    <span style={{
      fontSize: "11px", fontWeight: 700, borderRadius: "4px", padding: "2px 8px",
      background: isApproved ? "#dcfce7" : "#fee2e2",
      color:      isApproved ? "#15803d" : "#b91c1c",
      whiteSpace: "nowrap" as const,
    }}>
      {isApproved ? "Godkendt" : "Afvist"}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PatternAnalysis({
  specialty,
  module,
  initialRun,
  disabled,
  disagreements = [],
}: Props) {

  // ── Analysis state ────────────────────────────────────────────────────────
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<PatternAnalysisResult | null>(
    initialRun ? runToResult(initialRun) : null
  );
  const [savedRun, setSavedRun] = useState<OptimizationRun | null>(initialRun ?? null);
  const [error,    setError]    = useState<string | null>(null);

  // ── Simulator state ───────────────────────────────────────────────────────
  const [promptText,  setPromptText]  = useState<string>(initialRun?.improved_prompt ?? "");
  const [simRunning,  setSimRunning]  = useState(false);
  const [simProgress, setSimProgress] = useState<{ scored: number; total: number } | null>(null);
  const [simResults,  setSimResults]  = useState<Map<string, { decision: string; confidence: number }> | null>(null);
  const [simDone,     setSimDone]     = useState(false);
  const [simError,    setSimError]    = useState<string | null>(null);

  // ── Save state ────────────────────────────────────────────────────────────
  const [saving,       setSaving]       = useState(false);
  const [savedVersion, setSavedVersion] = useState<string | null>(null);
  const [saveError,    setSaveError]    = useState<string | null>(null);

  // ── Rescore state ─────────────────────────────────────────────────────────
  const [rescoring,       setRescoring]       = useState(false);
  const [rescoreProgress, setRescoreProgress] = useState<{ scored: number; total: number } | null>(null);
  const [rescoreDone,     setRescoreDone]     = useState(false);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleAnalyze() {
    if (disabled) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSavedRun(null);
    // Reset downstream state
    setSimResults(null);
    setSimDone(false);
    setSimProgress(null);
    setSavedVersion(null);
    setSaveError(null);
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
        const newResult: PatternAnalysisResult = {
          false_positive_patterns: data.false_positive_patterns ?? [],
          false_negative_patterns: data.false_negative_patterns ?? [],
          recommended_changes:     data.recommended_changes     ?? "",
          improved_prompt:         data.improved_prompt         ?? "",
          current_prompt:          data.current_prompt          ?? "",
        };
        setResult(newResult);
        setPromptText(newResult.improved_prompt);
      }
    } catch {
      setError("Netværksfejl — prøv igen");
    } finally {
      setLoading(false);
    }
  }

  async function handleSimulate() {
    if (simRunning || disagreements.length === 0) return;
    setSimRunning(true);
    setSimError(null);
    setSimResults(null);
    setSimDone(false);
    setSimProgress({ scored: 0, total: disagreements.length });

    const newResults = new Map<string, { decision: string; confidence: number }>();
    try {
      await consumeSSE(
        "/api/lab/simulate-prompt",
        { specialty, prompt: promptText, article_ids: disagreements.map((d) => d.article_id) },
        (data) => {
          if (data.article_id && data.decision !== undefined) {
            newResults.set(data.article_id as string, {
              decision:   data.decision   as string,
              confidence: (data.confidence as number) ?? 0,
            });
          }
          if (data.scored !== undefined) {
            setSimProgress({
              scored: data.scored as number,
              total:  (data.total as number) ?? disagreements.length,
            });
          }
          if (data.done) {
            setSimResults(new Map(newResults));
            setSimDone(true);
          }
        }
      );
    } catch (e) {
      setSimError(String(e));
    } finally {
      setSimRunning(false);
    }
  }

  function handleDiscard() {
    setSimResults(null);
    setSimDone(false);
    setSimProgress(null);
    setSimError(null);
    setSaveError(null);
    setPromptText(result?.improved_prompt ?? "");
  }

  async function handleSaveVersion() {
    if (!promptText.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/lab/model-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialty, module, prompt: promptText, activate: true }),
      });
      const data = await res.json() as { ok: boolean; version?: string; error?: string };
      if (!data.ok) {
        setSaveError(data.error ?? "Fejl ved gemning");
        setSaving(false);
        return;
      }
      setSavedVersion(data.version ?? "ny version");
    } catch {
      setSaveError("Netværksfejl — prøv igen");
      setSaving(false);
    }
  }

  async function handleRescore() {
    if (rescoring) return;
    setRescoring(true);
    setRescoreDone(false);
    setRescoreProgress({ scored: 0, total: 0 });
    try {
      await consumeSSE(
        "/api/lab/score-batch",
        { specialty },
        (data) => {
          if (data.scored !== undefined) {
            setRescoreProgress({
              scored: data.scored as number,
              total:  (data.total  as number) ?? 0,
            });
          }
          if (data.done) setRescoreDone(true);
        }
      );
    } catch {
      // non-critical — just stop the spinner
    } finally {
      setRescoring(false);
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const isAnalyzeDisabled = disabled || loading;
  const totalDisagreements = savedRun
    ? (savedRun.fp_count ?? 0) + (savedRun.fn_count ?? 0)
    : null;

  const simSummary = (simDone && simResults && disagreements.length > 0) ? (() => {
    const fixed = disagreements.filter(
      (d) => simResults.get(d.article_id)?.decision === d.human_decision
    ).length;
    const total       = disagreements.length;
    const newAccuracy = Math.round(fixed / total * 100);
    return { fixed, total, newAccuracy };
  })() : null;

  // ── Shared styles ─────────────────────────────────────────────────────────

  const labelStyle: React.CSSProperties = {
    fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "8px",
  };

  const cardStyle: React.CSSProperties = {
    background: "#fff", borderRadius: "10px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
    overflow: "hidden",
  };

  const headerStyle: React.CSSProperties = {
    background: "#EEF2F7", borderBottom: "1px solid #dde3ed",
    padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
  };

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A",
    textTransform: "uppercase" as const, fontWeight: 700,
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* ══ Card 1: Pattern Analysis (Step 2) ══════════════════════════════ */}
      <div style={cardStyle}>

        {/* Header */}
        <div style={headerStyle}>
          <div>
            <span style={sectionLabelStyle}>AI Mønsteranalyse · Step 2</span>
            {savedRun && (
              <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>
                Analyseret {formatDate(savedRun.created_at)} · Baseret på {totalDisagreements} uenigheder · {savedRun.base_version}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={isAnalyzeDisabled}
            title={disabled ? "Utilstrækkelig data — kræver mindst 50 uenigheder" : undefined}
            style={{
              fontSize: "12px", fontWeight: 700,
              background: isAnalyzeDisabled ? "#f0f2f5" : "#1a1a1a",
              color:      isAnalyzeDisabled ? "#aaa"    : "#fff",
              border: "none", borderRadius: "6px", padding: "5px 14px",
              cursor: isAnalyzeDisabled ? "not-allowed" : "pointer",
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
                ? "Utilstrækkelig data — kræver mindst 50 uenigheder for at køre mønsteranalyse."
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

      {/* ══ Card 2: Prompt Simulator (Step 3) — only when result exists ═════ */}
      {result && !savedVersion && (
        <div style={cardStyle}>

          {/* Header */}
          <div style={headerStyle}>
            <span style={sectionLabelStyle}>Prompt Simulator · Step 3</span>
            <button
              type="button"
              onClick={handleSimulate}
              disabled={simRunning || disagreements.length === 0}
              style={{
                fontSize: "12px", fontWeight: 700,
                background: (simRunning || disagreements.length === 0) ? "#f0f2f5" : "#1a1a1a",
                color:      (simRunning || disagreements.length === 0) ? "#aaa"    : "#fff",
                border: "none", borderRadius: "6px", padding: "5px 14px",
                cursor: (simRunning || disagreements.length === 0) ? "not-allowed" : "pointer",
                display: "inline-flex", alignItems: "center", gap: "6px",
              }}
            >
              {simRunning && <Spinner size={12} />}
              {simRunning ? "Simulerer…" : "Kør simulation"}
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* Editable prompt */}
            <div>
              <div style={labelStyle}>Prompt til simulation</div>
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                disabled={simRunning}
                rows={14}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "12px 14px",
                  border: "1px solid #e0e4ed", borderRadius: "8px",
                  fontFamily: "ui-monospace, 'Cascadia Code', monospace",
                  fontSize: "12px", lineHeight: 1.7,
                  background: simRunning ? "#f8f9fb" : "#fff",
                  color: "#1a1a1a",
                  resize: "vertical",
                  outline: "none",
                }}
              />
              {disagreements.length === 0 && (
                <p style={{ fontSize: "12px", color: "#d97706", margin: "4px 0 0" }}>
                  Ingen uenigheder tilgængelige til simulation.
                </p>
              )}
            </div>

            {/* Progress bar */}
            {simRunning && simProgress && (
              <div>
                <div style={{ fontSize: "13px", color: "#5a6a85", marginBottom: "8px" }}>
                  Scorer artikel {simProgress.scored} af {simProgress.total}…
                </div>
                <div style={{ height: "6px", background: "#e8ecf1", borderRadius: "99px" }}>
                  <div style={{
                    height: "100%",
                    width: `${simProgress.total > 0 ? Math.round(simProgress.scored / simProgress.total * 100) : 0}%`,
                    background: "#E83B2A",
                    borderRadius: "99px",
                    transition: "width 0.4s ease",
                  }} />
                </div>
              </div>
            )}

            {simError && (
              <div style={{ fontSize: "13px", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "7px", padding: "10px 14px" }}>
                {simError}
              </div>
            )}

            {/* Comparison table */}
            {simDone && simResults && (
              <div>
                <div style={{ overflowX: "auto", marginBottom: "16px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr>
                        {(["Titel", "Human", "Gammel AI", "Ny AI", "Rettet?"] as const).map((h) => (
                          <th key={h} style={{
                            textAlign: "left", padding: "6px 10px",
                            color: "#5a6a85", fontSize: "11px", fontWeight: 700,
                            textTransform: "uppercase", letterSpacing: "0.04em",
                            borderBottom: "2px solid #e8ecf1", whiteSpace: "nowrap",
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {disagreements.map((d, i) => {
                        const sim   = simResults.get(d.article_id);
                        const fixed = sim?.decision === d.human_decision;
                        return (
                          <tr key={d.article_id} style={{ background: i % 2 === 1 ? "#fafafa" : "transparent" }}>
                            <td style={{ padding: "7px 10px", color: "#2a2a2a", borderBottom: "1px solid #f0f2f5", maxWidth: "280px" }}>
                              {truncate(d.title, 60)}
                            </td>
                            <td style={{ padding: "7px 10px", borderBottom: "1px solid #f0f2f5" }}>
                              <DecisionBadge decision={d.human_decision} />
                            </td>
                            <td style={{ padding: "7px 10px", borderBottom: "1px solid #f0f2f5" }}>
                              <DecisionBadge decision={d.old_ai_decision} />
                            </td>
                            <td style={{ padding: "7px 10px", borderBottom: "1px solid #f0f2f5" }}>
                              {sim
                                ? <DecisionBadge decision={sim.decision} />
                                : <span style={{ color: "#aaa" }}>—</span>
                              }
                            </td>
                            <td style={{ padding: "7px 10px", borderBottom: "1px solid #f0f2f5", textAlign: "center", fontSize: "15px" }}>
                              {sim ? (fixed ? "✅" : "❌") : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Summary */}
                {simSummary && (
                  <div style={{
                    background: "#f8f9fb", border: "1px solid #e8ecf1",
                    borderRadius: "8px", padding: "14px 16px",
                    display: "flex", flexDirection: "column", gap: "6px",
                  }}>
                    <div style={{ fontSize: "13px", color: "#2a2a2a" }}>
                      <strong>Uenigheder rettet:</strong> {simSummary.fixed} / {simSummary.total}
                    </div>
                    <div style={{ fontSize: "13px", color: "#2a2a2a" }}>
                      <strong>Ny nøjagtighed på disse sager:</strong> {simSummary.newAccuracy}%
                    </div>
                    <div style={{ fontSize: "13px", color: simSummary.newAccuracy > 0 ? "#15803d" : "#b91c1c" }}>
                      <strong>Forbedring vs. {savedRun?.base_version ?? "forrige version"}:</strong>{" "}
                      {simSummary.newAccuracy > 0 ? "+" : ""}{simSummary.newAccuracy} procentpoint
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Step 4: Decision — only after simulation ═══════════════════════ */}
      {result && simDone && !savedVersion && (
        <div style={{
          ...cardStyle, overflow: "visible",
          padding: "20px 24px",
        }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "16px" }}>
            Beslutning · Step 4
          </div>

          {saveError && (
            <div style={{ fontSize: "13px", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "7px", padding: "10px 14px", marginBottom: "12px" }}>
              {saveError}
            </div>
          )}

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleSaveVersion}
              disabled={saving}
              style={{
                fontSize: "13px", fontWeight: 700,
                background: saving ? "#f0f2f5" : "#15803d",
                color:      saving ? "#aaa"    : "#fff",
                border: "none", borderRadius: "7px", padding: "9px 18px",
                cursor: saving ? "not-allowed" : "pointer",
                display: "inline-flex", alignItems: "center", gap: "6px",
              }}
            >
              {saving && <Spinner size={13} />}
              {saving ? "Gemmer…" : "Gem og aktiver som ny version"}
            </button>

            <button
              type="button"
              onClick={handleDiscard}
              disabled={saving}
              style={{
                fontSize: "13px", fontWeight: 600,
                background: "none", color: "#5a6a85",
                border: "1px solid #dde3ed", borderRadius: "7px", padding: "9px 18px",
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              Kassér — prøv anden prompt
            </button>
          </div>
        </div>
      )}

      {/* ══ Success card ═══════════════════════════════════════════════════ */}
      {savedVersion && (
        <div style={{
          background: "#f0fdf4", border: "1px solid #bbf7d0",
          borderRadius: "10px", padding: "20px 24px",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "16px" }}>
            <span style={{
              width: "28px", height: "28px", borderRadius: "50%",
              background: "#15803d", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "15px", fontWeight: 700, flexShrink: 0,
            }}>✓</span>
            <div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#14532d" }}>
                Model {savedVersion} aktiveret
              </div>
              <div style={{ fontSize: "13px", color: "#166534", marginTop: "2px" }}>
                Den nye prompt er nu aktiv og bruges til fremtidige scoreringer.
              </div>
            </div>
          </div>

          {rescoreDone ? (
            <div style={{ fontSize: "13px", color: "#15803d", fontWeight: 600 }}>
              ✓ Rescoring afsluttet — {rescoreProgress?.scored ?? 0} artikler scoret med {savedVersion}
            </div>
          ) : rescoring && rescoreProgress ? (
            <div>
              <div style={{ fontSize: "13px", color: "#166534", marginBottom: "8px" }}>
                Rescorer artikel {rescoreProgress.scored} af {rescoreProgress.total}…
              </div>
              <div style={{ height: "5px", background: "#bbf7d0", borderRadius: "99px" }}>
                <div style={{
                  height: "100%",
                  width: `${rescoreProgress.total > 0 ? Math.round(rescoreProgress.scored / rescoreProgress.total * 100) : 0}%`,
                  background: "#15803d", borderRadius: "99px", transition: "width 0.4s ease",
                }} />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleRescore}
              style={{
                fontSize: "13px", fontWeight: 700,
                background: "#fff", color: "#15803d",
                border: "1px solid #86efac", borderRadius: "7px", padding: "8px 16px",
                cursor: "pointer",
              }}
            >
              Re-score ventende artikler →
            </button>
          )}
        </div>
      )}

    </div>
  );
}
