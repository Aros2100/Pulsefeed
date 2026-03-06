"use client";

import Link from "next/link";
import { useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SimulationDisagreement {
  article_id: string;
  title: string;
  journal_title: string | null;
  human_decision: string;
  old_ai_decision: string;
  old_ai_confidence: number | null;
  disagreement_reason: string | null;
}

export interface SimulationAgreement {
  article_id: string;
  title: string;
  journal_title: string | null;
  human_decision: string;
  old_ai_decision: string;
  old_ai_confidence: number | null;
}

interface SimResult {
  decision: string;
  confidence: number;
  reason: string | null;
}

interface Props {
  runId: string;
  specialty: string;
  module: string;
  baseVersion: string;
  initialPrompt: string;
  disagreements: SimulationDisagreement[];
  agreementArticles: SimulationAgreement[];
}

type Filter    = "all" | "fixed" | "wrong";
type RegFilter = "all" | "ok" | "regression";

// ── SSE helper ─────────────────────────────────────────────────────────────────

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
        catch { /* ignore */ }
      }
    }
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg className="animate-spin" style={{ width: size, height: size, flexShrink: 0 }} viewBox="0 0 24 24" fill="none">
      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function DecisionBadge({ decision, confidence }: { decision: string; confidence?: number | null }) {
  const isApproved = decision === "approved";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
      <span style={{
        fontSize: "11px", fontWeight: 700, borderRadius: "4px", padding: "2px 7px",
        background: isApproved ? "#dcfce7" : "#fee2e2",
        color:      isApproved ? "#15803d" : "#b91c1c",
        whiteSpace: "nowrap" as const,
      }}>
        {isApproved ? "Godkendt" : "Afvist"}
      </span>
      {confidence != null && (
        <span style={{
          fontSize: "11px", fontWeight: 700, borderRadius: "4px", padding: "2px 7px",
          background: isApproved ? "#dcfce7" : "#fee2e2",
          color:      isApproved ? "#15803d" : "#b91c1c",
        }}>{confidence}%</span>
      )}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SimulatorClient({
  runId: _runId,
  specialty,
  module,
  baseVersion,
  initialPrompt,
  disagreements,
  agreementArticles,
}: Props) {
  // ── Prompt state ─────────────────────────────────────────────────────────
  const [promptText, setPromptText] = useState(initialPrompt);

  // ── Simulation state ──────────────────────────────────────────────────────
  const [simRunning,  setSimRunning]  = useState(false);
  const [simProgress, setSimProgress] = useState<{ scored: number; total: number } | null>(null);
  const [simResults,  setSimResults]  = useState<Map<string, SimResult> | null>(null);
  const [regResults,  setRegResults]  = useState<Map<string, SimResult> | null>(null);
  const [simDone,     setSimDone]     = useState(false);
  const [simError,    setSimError]    = useState<string | null>(null);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [filter,    setFilter]    = useState<Filter>("all");
  const [regFilter, setRegFilter] = useState<RegFilter>("all");

  // ── Save state ────────────────────────────────────────────────────────────
  const [saving,       setSaving]       = useState(false);
  const [savedVersion, setSavedVersion] = useState<string | null>(null);
  const [saveError,    setSaveError]    = useState<string | null>(null);

  // ── Rescore state ─────────────────────────────────────────────────────────
  const [rescoring,       setRescoring]       = useState(false);
  const [rescoreProgress, setRescoreProgress] = useState<{ scored: number; total: number } | null>(null);
  const [rescoreDone,     setRescoreDone]     = useState(false);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSimulate() {
    if (simRunning) return;
    const totalArticles = disagreements.length + agreementArticles.length;
    if (totalArticles === 0) return;

    setSimRunning(true);
    setSimError(null);
    setSimResults(null);
    setRegResults(null);
    setSimDone(false);
    setSimProgress({ scored: 0, total: totalArticles });

    const newResults    = new Map<string, SimResult>();
    const newRegResults = new Map<string, SimResult>();

    try {
      // Phase 1: Score disagreements (error correction)
      if (disagreements.length > 0) {
        await consumeSSE(
          "/api/lab/simulate-prompt",
          { specialty, prompt: promptText, article_ids: disagreements.map((d) => d.article_id) },
          (data) => {
            if (data.article_id && data.decision !== undefined) {
              newResults.set(data.article_id as string, {
                decision:   data.decision   as string,
                confidence: (data.confidence as number) ?? 0,
                reason:     (data.reason    as string | null) ?? null,
              });
            }
            if (data.scored !== undefined) {
              setSimProgress({
                scored: data.scored as number,
                total:  totalArticles,
              });
            }
          }
        );
      }

      setSimResults(new Map(newResults));

      // Phase 2: Score agreement sample (regression test)
      if (agreementArticles.length > 0) {
        const phase1Count = disagreements.length;
        await consumeSSE(
          "/api/lab/simulate-prompt",
          { specialty, prompt: promptText, article_ids: agreementArticles.map((d) => d.article_id) },
          (data) => {
            if (data.article_id && data.decision !== undefined) {
              newRegResults.set(data.article_id as string, {
                decision:   data.decision   as string,
                confidence: (data.confidence as number) ?? 0,
                reason:     (data.reason    as string | null) ?? null,
              });
            }
            if (data.scored !== undefined) {
              setSimProgress({
                scored: phase1Count + (data.scored as number),
                total:  totalArticles,
              });
            }
          }
        );
      }

      setRegResults(new Map(newRegResults));
      setSimDone(true);
    } catch (e) {
      setSimError(String(e));
    } finally {
      setSimRunning(false);
    }
  }

  function handleDiscard() {
    setSimResults(null);
    setRegResults(null);
    setSimDone(false);
    setSimProgress(null);
    setSimError(null);
    setSaveError(null);
    setFilter("all");
    setRegFilter("all");
    setPromptText(initialPrompt);
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
        { specialty, scoreAll: true },
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
      // non-critical
    } finally {
      setRescoring(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const summary = (simDone && simResults && disagreements.length > 0) ? (() => {
    const fixed = disagreements.filter(
      (d) => simResults.get(d.article_id)?.decision === d.human_decision
    ).length;
    const total       = disagreements.length;
    const newAccuracy = Math.round(fixed / total * 100);
    return { fixed, total, newAccuracy };
  })() : null;

  const regressionSummary = (simDone && regResults && agreementArticles.length > 0) ? (() => {
    const regressions = agreementArticles.filter(
      (d) => regResults.get(d.article_id)?.decision !== d.human_decision
    ).length;
    return { regressions, total: agreementArticles.length };
  })() : null;

  const filteredRows = disagreements.filter((d) => {
    if (!simResults || filter === "all") return true;
    const fixed = simResults.get(d.article_id)?.decision === d.human_decision;
    return filter === "fixed" ? fixed : !fixed;
  });

  const filteredRegRows = agreementArticles.filter((d) => {
    if (!regResults || regFilter === "all") return true;
    const isRegression = regResults.get(d.article_id)?.decision !== d.human_decision;
    return regFilter === "regression" ? isRegression : !isRegression;
  });

  const isDisabled = simRunning || (disagreements.length === 0 && agreementArticles.length === 0);

  // ── Styles ────────────────────────────────────────────────────────────────

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

  const thStyle: React.CSSProperties = {
    textAlign: "left", padding: "8px 12px",
    color: "#5a6a85", fontSize: "11px", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.04em",
    borderBottom: "2px solid #e8ecf1", whiteSpace: "nowrap",
    background: "#fafafa",
  };

  const tdStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderBottom: "1px solid #f0f2f5",
    fontSize: "12px", color: "#2a2a2a",
    verticalAlign: "top",
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Back */}
        <div style={{ marginBottom: "8px" }}>
          <Link
            href={`/admin/lab/specialty-tag/optimize`}
            style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}
          >
            ← Optimize
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            Prompt Simulator · Specialty Tag
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
            Simuler forbedret prompt
          </h1>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Baseret på analyse af {specialty} · {baseVersion} · {disagreements.length} uenigheder + {agreementArticles.length} regressionstest
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* ── Card: Prompt ── */}
          {!savedVersion && (
            <div style={cardStyle}>
              <div style={headerStyle}>
                <span style={sectionLabelStyle}>Prompt til simulation · Step 3</span>
                <button
                  type="button"
                  onClick={handleSimulate}
                  disabled={isDisabled}
                  style={{
                    fontSize: "12px", fontWeight: 700,
                    background: isDisabled ? "#f0f2f5" : "#1a1a1a",
                    color:      isDisabled ? "#aaa"    : "#fff",
                    border: "none", borderRadius: "6px", padding: "5px 14px",
                    cursor: isDisabled ? "not-allowed" : "pointer",
                    display: "inline-flex", alignItems: "center", gap: "6px",
                  }}
                >
                  {simRunning && <Spinner size={12} />}
                  {simRunning ? "Simulerer…" : "Kør simulation"}
                </button>
              </div>

              <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
                <textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  disabled={simRunning}
                  rows={16}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "12px 14px",
                    border: "1px solid #e0e4ed", borderRadius: "8px",
                    fontFamily: "ui-monospace, 'Cascadia Code', monospace",
                    fontSize: "12px", lineHeight: 1.7,
                    background: simRunning ? "#f8f9fb" : "#fff",
                    color: "#1a1a1a", resize: "vertical", outline: "none",
                  }}
                />

                {/* Progress */}
                {simRunning && simProgress && (
                  <div>
                    <div style={{ fontSize: "13px", color: "#5a6a85", marginBottom: "8px" }}>
                      Scorer artikel {simProgress.scored} af {simProgress.total}…
                    </div>
                    <div style={{ height: "6px", background: "#e8ecf1", borderRadius: "99px" }}>
                      <div style={{
                        height: "100%",
                        width: `${simProgress.total > 0 ? Math.round(simProgress.scored / simProgress.total * 100) : 0}%`,
                        background: "#E83B2A", borderRadius: "99px", transition: "width 0.4s ease",
                      }} />
                    </div>
                  </div>
                )}

                {simError && (
                  <div style={{ fontSize: "13px", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "7px", padding: "10px 14px" }}>
                    {simError}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Section 1: Fejlrettelse ── */}
          {simDone && simResults && disagreements.length > 0 && (
            <div style={cardStyle}>
              <div style={headerStyle}>
                <span style={sectionLabelStyle}>Sektion 1 · Fejlrettelse</span>
                {summary && (
                  <span style={{ fontSize: "12px", color: "#5a6a85" }}>
                    {summary.fixed} / {summary.total} rettet
                  </span>
                )}
              </div>

              {/* Filter bar */}
              <div style={{
                padding: "12px 24px", borderBottom: "1px solid #e8ecf1",
                display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap",
              }}>
                <span style={{ fontSize: "12px", color: "#5a6a85", fontWeight: 600, marginRight: "4px" }}>Filter:</span>
                {(["all", "fixed", "wrong"] as Filter[]).map((f) => {
                  const labels: Record<Filter, string> = {
                    all:   "Alle",
                    fixed: "Kun rettede ✅",
                    wrong: "Kun stadig forkerte ❌",
                  };
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      style={{
                        fontSize: "12px", fontWeight: filter === f ? 700 : 500,
                        background: filter === f ? "#1a1a1a" : "#f0f2f5",
                        color:      filter === f ? "#fff"    : "#5a6a85",
                        border: "none", borderRadius: "6px", padding: "4px 12px",
                        cursor: "pointer",
                      }}
                    >
                      {labels[f]}
                    </button>
                  );
                })}
                <span style={{ marginLeft: "auto", fontSize: "12px", color: "#888" }}>
                  {filteredRows.length} artikel{filteredRows.length !== 1 ? "er" : ""}
                </span>
              </div>

              {/* Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, minWidth: "220px" }}>Titel</th>
                      <th style={{ ...thStyle, minWidth: "120px" }}>Journal</th>
                      <th style={{ ...thStyle, minWidth: "90px" }}>Human</th>
                      <th style={{ ...thStyle, minWidth: "160px" }}>Gammel AI</th>
                      <th style={{ ...thStyle, minWidth: "160px" }}>Ny AI</th>
                      <th style={{ ...thStyle, minWidth: "110px", textAlign: "center" }}>Rettet?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((d, i) => {
                      const sim   = simResults.get(d.article_id);
                      const fixed = sim?.decision === d.human_decision;
                      return (
                        <tr key={d.article_id} style={{ background: i % 2 === 1 ? "#fafafa" : "#fff" }}>
                          <td style={{ ...tdStyle, maxWidth: "280px" }}>
                            <a
                              href={`/articles/${d.article_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontWeight: 500, lineHeight: 1.4, display: "block", marginBottom: "2px",
                                color: "inherit", textDecoration: "none",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                            >
                              {d.title}
                            </a>
                          </td>
                          <td style={{ ...tdStyle, color: "#5a6a85" }}>
                            {d.journal_title ?? <span style={{ color: "#ccc" }}>—</span>}
                          </td>
                          <td style={tdStyle}>
                            <DecisionBadge decision={d.human_decision} />
                          </td>
                          <td style={tdStyle}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <DecisionBadge decision={d.old_ai_decision} confidence={d.old_ai_confidence} />
                              {d.disagreement_reason && (
                                <div style={{ fontSize: "11px", color: "#888", lineHeight: 1.4, fontStyle: "italic" }}>
                                  {d.disagreement_reason}
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={tdStyle}>
                            {sim ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                <DecisionBadge decision={sim.decision} confidence={sim.confidence} />
                                {sim.reason && (
                                  <div style={{ fontSize: "11px", color: "#888", lineHeight: 1.4, fontStyle: "italic" }}>
                                    {sim.reason}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: "#aaa" }}>—</span>
                            )}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            {sim ? (
                              <span style={{
                                fontSize: "12px", fontWeight: 700,
                                color: fixed ? "#15803d" : "#b91c1c",
                              }}>
                                {fixed ? "✅ Rettet" : "❌ Stadig forkert"}
                              </span>
                            ) : (
                              <span style={{ color: "#aaa" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Section 2: Regressionstest ── */}
          {simDone && regResults && agreementArticles.length > 0 && (
            <div style={cardStyle}>
              <div style={headerStyle}>
                <span style={sectionLabelStyle}>Sektion 2 · Regressionstest</span>
                {regressionSummary && (
                  <span style={{ fontSize: "12px", color: "#5a6a85" }}>
                    {regressionSummary.regressions} regression{regressionSummary.regressions !== 1 ? "er" : ""} / {regressionSummary.total}
                  </span>
                )}
              </div>

              {/* Filter bar */}
              <div style={{
                padding: "12px 24px", borderBottom: "1px solid #e8ecf1",
                display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap",
              }}>
                <span style={{ fontSize: "12px", color: "#5a6a85", fontWeight: 600, marginRight: "4px" }}>Filter:</span>
                {(["all", "ok", "regression"] as RegFilter[]).map((f) => {
                  const labels: Record<RegFilter, string> = {
                    all:        "Alle",
                    ok:         "Kun OK ✅",
                    regression: "Kun regressioner ❌",
                  };
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setRegFilter(f)}
                      style={{
                        fontSize: "12px", fontWeight: regFilter === f ? 700 : 500,
                        background: regFilter === f ? "#1a1a1a" : "#f0f2f5",
                        color:      regFilter === f ? "#fff"    : "#5a6a85",
                        border: "none", borderRadius: "6px", padding: "4px 12px",
                        cursor: "pointer",
                      }}
                    >
                      {labels[f]}
                    </button>
                  );
                })}
                <span style={{ marginLeft: "auto", fontSize: "12px", color: "#888" }}>
                  {filteredRegRows.length} artikel{filteredRegRows.length !== 1 ? "er" : ""}
                </span>
              </div>

              {/* Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, minWidth: "220px" }}>Titel</th>
                      <th style={{ ...thStyle, minWidth: "120px" }}>Journal</th>
                      <th style={{ ...thStyle, minWidth: "90px" }}>Human</th>
                      <th style={{ ...thStyle, minWidth: "160px" }}>Gammel AI</th>
                      <th style={{ ...thStyle, minWidth: "160px" }}>Ny AI</th>
                      <th style={{ ...thStyle, minWidth: "120px", textAlign: "center" }}>Regression?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRegRows.map((d, i) => {
                      const sim          = regResults.get(d.article_id);
                      const isRegression = sim?.decision !== d.human_decision;
                      return (
                        <tr key={d.article_id} style={{ background: i % 2 === 1 ? "#fafafa" : "#fff" }}>
                          <td style={{ ...tdStyle, maxWidth: "280px" }}>
                            <a
                              href={`/articles/${d.article_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontWeight: 500, lineHeight: 1.4, display: "block", marginBottom: "2px",
                                color: "inherit", textDecoration: "none",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                            >
                              {d.title}
                            </a>
                          </td>
                          <td style={{ ...tdStyle, color: "#5a6a85" }}>
                            {d.journal_title ?? <span style={{ color: "#ccc" }}>—</span>}
                          </td>
                          <td style={tdStyle}>
                            <DecisionBadge decision={d.human_decision} />
                          </td>
                          <td style={tdStyle}>
                            <DecisionBadge decision={d.old_ai_decision} confidence={d.old_ai_confidence} />
                          </td>
                          <td style={tdStyle}>
                            {sim ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                <DecisionBadge decision={sim.decision} confidence={sim.confidence} />
                                {sim.reason && (
                                  <div style={{ fontSize: "11px", color: "#888", lineHeight: 1.4, fontStyle: "italic" }}>
                                    {sim.reason}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: "#aaa" }}>—</span>
                            )}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            {sim ? (
                              <span style={{
                                fontSize: "12px", fontWeight: 700,
                                color: isRegression ? "#b91c1c" : "#15803d",
                              }}>
                                {isRegression ? "❌ Regression" : "✅ OK"}
                              </span>
                            ) : (
                              <span style={{ color: "#aaa" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Summary bar ── */}
          {simDone && (summary ?? regressionSummary) && (
            <div style={{
              background: "#fff", borderRadius: "10px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
              padding: "16px 24px",
              display: "flex", flexDirection: "column", gap: "16px",
            }}>
              <div style={{ display: "flex", gap: "32px", flexWrap: "wrap", alignItems: "center" }}>
                {summary && (
                  <>
                    <div>
                      <div style={{ fontSize: "11px", color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>
                        Fejl rettet
                      </div>
                      <div style={{ fontSize: "18px", fontWeight: 700, color: "#1a1a1a" }}>
                        {summary.fixed} / {summary.total}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>
                        Ny nøjagtighed
                      </div>
                      <div style={{ fontSize: "18px", fontWeight: 700, color: summary.newAccuracy >= 50 ? "#15803d" : "#b91c1c" }}>
                        {summary.newAccuracy}%
                      </div>
                    </div>
                  </>
                )}
                {regressionSummary && (
                  <div>
                    <div style={{ fontSize: "11px", color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>
                      Regressioner
                    </div>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: regressionSummary.regressions > 5 ? "#b91c1c" : "#15803d" }}>
                      {regressionSummary.regressions} / {regressionSummary.total}
                    </div>
                  </div>
                )}
              </div>

              {/* Regression warning/success banner */}
              {regressionSummary && (
                <div style={{
                  borderRadius: "7px", padding: "10px 14px",
                  background: regressionSummary.regressions > 5 ? "#fef2f2" : "#f0fdf4",
                  border: `1px solid ${regressionSummary.regressions > 5 ? "#fecaca" : "#bbf7d0"}`,
                  fontSize: "13px", fontWeight: 600,
                  color: regressionSummary.regressions > 5 ? "#b91c1c" : "#15803d",
                }}>
                  {regressionSummary.regressions > 5
                    ? `⚠️ Advarsel: den nye prompt introducerer regressioner (${regressionSummary.regressions} af ${regressionSummary.total})`
                    : "✅ Ingen væsentlige regressioner"}
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Decision ── */}
          {simDone && !savedVersion && (
            <div style={{
              background: "#fff", borderRadius: "10px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
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

          {/* ── Success card ── */}
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
      </div>
    </div>
  );
}
