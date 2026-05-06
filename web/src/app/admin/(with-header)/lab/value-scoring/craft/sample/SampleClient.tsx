"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Candidate } from "./page";

interface Props {
  moduleId:          string;
  phase:             string;
  candidates:        Candidate[];
  targets:           Record<string, number>;
  totalTarget:       number;
  qualificationFields: string[];
}

const ACCENT = "#7c3aed"; // purple for value-scoring
const ACCENT_BG = "#f5f3ff";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function SampleClient({
  moduleId, phase, candidates, targets, totalTarget, qualificationFields,
}: Props) {
  const router = useRouter();

  const [generating, setGenerating]  = useState(false);
  const [accepting,  setAccepting]   = useState(false);
  const [replacing,  setReplacing]   = useState<Record<string, boolean>>({});
  const [expanded,   setExpanded]    = useState<Set<string>>(new Set());
  const [warnings,   setWarnings]    = useState<Record<string, string>>({}); // articleType → warning
  const [error,      setError]       = useState<string | null>(null);
  const [criteriaOpen, setCriteriaOpen] = useState(false);

  // Counts per type
  const countByType: Record<string, number> = {};
  for (const c of candidates) {
    countByType[c.article_type] = (countByType[c.article_type] ?? 0) + 1;
  }
  const totalCount = candidates.length;
  const allTargetsMet = Object.entries(targets).every(
    ([t, n]) => (countByType[t] ?? 0) >= n
  );

  // Group candidates by article_type in target order
  const typeOrder = Object.keys(targets);
  const byType: Record<string, Candidate[]> = {};
  for (const c of candidates) {
    if (!byType[c.article_type]) byType[c.article_type] = [];
    byType[c.article_type].push(c);
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function generate() {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/lab/value-scoring/craft/generate", { method: "POST" });
      const json = await res.json();
      if (!json.ok) { setError(json.error ?? "Generation failed"); return; }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function reject(candidateId: string, articleType: string) {
    setError(null);
    setReplacing(prev => ({ ...prev, [candidateId]: true }));
    try {
      const res = await fetch("/api/admin/lab/value-scoring/craft/replace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.error ?? "Replace failed"); return; }
      if (json.warning) {
        setWarnings(prev => ({ ...prev, [articleType]: json.warning }));
      } else {
        setWarnings(prev => { const n = { ...prev }; delete n[articleType]; return n; });
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Replace failed");
    } finally {
      setReplacing(prev => { const n = { ...prev }; delete n[candidateId]; return n; });
    }
  }

  async function accept() {
    if (!confirm(`Accept this sample of ${totalCount} articles and freeze it into the Lab? This cannot be undone.`)) return;
    setError(null);
    setAccepting(true);
    try {
      const res = await fetch("/api/admin/lab/value-scoring/craft/accept", { method: "POST" });
      const json = await res.json();
      if (!json.ok) { setError(json.error ?? "Accept failed"); return; }
      router.push("/admin/lab");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accept failed");
    } finally {
      setAccepting(false);
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (phase !== "sample") {
    return (
      <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", minHeight: "100vh" }}>
        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "32px", textAlign: "center" }}>
            <div style={{ fontSize: "14px", color: "#5a6a85" }}>
              This module has moved beyond the sample phase (current phase: <strong>{phase}</strong>).
            </div>
            <Link href="/admin/lab" style={{ display: "inline-block", marginTop: "16px", fontSize: "13px", color: ACCENT }}>
              ← Back to Lab
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f0f0f0", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb + title */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: ACCENT, textTransform: "uppercase", fontWeight: 700, marginBottom: "4px" }}>
            The Lab · Value Scoring · Craft
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Sample Phase</h1>
            <span style={{ fontSize: "11px", fontWeight: 700, color: ACCENT, background: ACCENT_BG, borderRadius: "6px", padding: "3px 10px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Phase: Sample
            </span>
          </div>
          <p style={{ fontSize: "13px", color: "#888", marginTop: "6px" }}>
            Select 98 articles from prod to form the pairwise training set.
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px 16px", marginBottom: "20px", fontSize: "13px", color: "#b91c1c" }}>
            {error}
          </div>
        )}

        {/* Criteria card (collapsible) */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", marginBottom: "20px", overflow: "hidden" }}>
          <button
            onClick={() => setCriteriaOpen(o => !o)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 20px", background: "none", border: "none", cursor: "pointer",
              fontSize: "13px", fontWeight: 600, color: "#1a1a1a",
            }}
          >
            <span>Sampling criteria</span>
            <span style={{ fontSize: "11px", color: "#94a3b8" }}>{criteriaOpen ? "▲ collapse" : "▼ expand"}</span>
          </button>
          {criteriaOpen && (
            <div style={{ borderTop: "1px solid #f0f0f0", padding: "16px 20px", fontSize: "13px", color: "#374151" }}>
              <div style={{ marginBottom: "12px" }}>
                <strong>Qualification fields (all must be NOT NULL):</strong>
                <div style={{ marginTop: "4px", color: "#6b7280" }}>
                  {qualificationFields.join(", ")}
                </div>
              </div>
              <div>
                <strong>Article type targets (total {totalTarget}):</strong>
                <div style={{ marginTop: "8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px" }}>
                  {Object.entries(targets).map(([type, n]) => (
                    <div key={type} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f5f5f5", paddingBottom: "4px" }}>
                      <span>{type}</span>
                      <span style={{ fontWeight: 600 }}>{n}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Status + action bar */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "16px 20px", marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600 }}>
                {totalCount} / {totalTarget} articles sampled
              </div>
              <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                {Object.entries(targets).map(([type, n]) => {
                  const got = countByType[type] ?? 0;
                  return (
                    <span key={type} style={{ marginRight: "10px", color: got >= n ? "#059669" : got > 0 ? "#d97706" : "#94a3b8" }}>
                      {type.split(" ")[0]}: {got}/{n}
                    </span>
                  );
                })}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {candidates.length === 0 && (
                <button
                  onClick={generate}
                  disabled={generating}
                  style={{
                    fontSize: "13px", fontWeight: 600, fontFamily: "inherit",
                    background: generating ? "#f0f2f5" : ACCENT,
                    color: generating ? "#94a3b8" : "#fff",
                    border: "none", borderRadius: "8px", padding: "8px 18px",
                    cursor: generating ? "default" : "pointer",
                  }}
                >
                  {generating ? "Generating…" : "Generér sample"}
                </button>
              )}
              {allTargetsMet && candidates.length > 0 && (
                <button
                  onClick={accept}
                  disabled={accepting}
                  style={{
                    fontSize: "13px", fontWeight: 600, fontFamily: "inherit",
                    background: accepting ? "#f0f2f5" : "#059669",
                    color: accepting ? "#94a3b8" : "#fff",
                    border: "none", borderRadius: "8px", padding: "8px 18px",
                    cursor: accepting ? "default" : "pointer",
                  }}
                >
                  {accepting ? "Accepterer…" : "Accepter sample →"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Article groups */}
        {candidates.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 0", color: "#94a3b8", fontSize: "14px" }}>
            No candidates yet. Click &ldquo;Generér sample&rdquo; to begin.
          </div>
        )}

        {typeOrder.map(type => {
          const articles = byType[type] ?? [];
          const target = targets[type] ?? 0;
          const met = articles.length >= target;
          const warning = warnings[type];

          return (
            <div key={type} style={{ marginBottom: "40px" }}>
              {/* Group header — standalone, visually detached from article cards */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: "12px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a1a" }}>{type}</span>
                  <span style={{
                    fontSize: "12px", fontWeight: 600,
                    color: met ? "#fff" : "#92400e",
                    background: met ? "#059669" : "#fef3c7",
                    borderRadius: "6px", padding: "2px 8px",
                  }}>
                    {articles.length}/{target}
                  </span>
                </div>
                {warning && (
                  <span style={{ fontSize: "11px", color: "#b45309", background: "#fef3c7", borderRadius: "4px", padding: "3px 10px" }}>
                    ⚠ {warning}
                  </span>
                )}
              </div>

              {/* Article cards */}
              {articles.length === 0 ? (
                <div style={{ fontSize: "12px", color: "#94a3b8", padding: "12px 0" }}>
                  No articles sampled for this type yet.
                </div>
              ) : (
                articles.map(c => {
                  const isExpanded = expanded.has(c.id);
                  const isReplacing = !!replacing[c.id];
                  return (
                    <div key={c.id} style={{
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: "10px",
                      marginBottom: "12px",
                      overflow: "hidden",
                    }}>
                      {/* Compact row */}
                      <div style={{ padding: "14px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a", lineHeight: 1.45, marginBottom: "4px" }}>
                            {c.title}
                          </div>
                          <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                            {[c.journal, fmtDate(c.published_date)].filter(Boolean).join(" · ")}
                            {c.pubmed_id && (
                              <span> · <a href={`https://pubmed.ncbi.nlm.nih.gov/${c.pubmed_id}/`} target="_blank" rel="noopener noreferrer" style={{ color: "#94a3b8" }}>PMID {c.pubmed_id}</a></span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                          <button
                            onClick={() => toggleExpand(c.id)}
                            style={{
                              fontSize: "11px", fontFamily: "inherit",
                              background: "#f5f7fa", color: "#5a6a85",
                              border: "1px solid #e5e7eb", borderRadius: "6px", padding: "5px 12px",
                              cursor: "pointer",
                            }}
                          >
                            {isExpanded ? "Skjul" : "Vis detaljer"}
                          </button>
                          <button
                            onClick={() => reject(c.id, c.article_type)}
                            disabled={isReplacing}
                            style={{
                              fontSize: "11px", fontFamily: "inherit",
                              background: "#fff",
                              color: isReplacing ? "#94a3b8" : "#b91c1c",
                              border: "1px solid #fecaca", borderRadius: "6px", padding: "5px 12px",
                              cursor: isReplacing ? "default" : "pointer",
                            }}
                          >
                            {isReplacing ? "…" : "Afvis"}
                          </button>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div style={{ borderTop: "1px solid #f0f0f0", padding: "20px 24px", background: "#fff" }}>
                          <FieldRow label="Short headline" value={c.short_headline} />
                          <FieldRow label="Short resume"   value={c.short_resume}   divider />
                          <FieldRow label="Bottom line"    value={c.bottom_line}    divider />
                          {/* SARI — label in left column, 2x2 grid in right column */}
                          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "0 16px", borderTop: "1px solid #ebebeb", paddingTop: "14px", marginTop: "14px", alignItems: "start" }}>
                            <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" as const, color: "#5a6a85", paddingTop: "2px" }}>
                              SARI
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", background: "#fafafa", borderRadius: "6px", padding: "14px" }}>
                              <SariCell label="Subject"     value={c.sari_subject} />
                              <SariCell label="Action"      value={c.sari_action} />
                              <SariCell label="Result"      value={c.sari_result} />
                              <SariCell label="Implication" value={c.sari_implication} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          );
        })}

        <div style={{ marginTop: "16px" }}>
          <Link href="/admin/lab" style={{ fontSize: "12px", color: "#94a3b8", textDecoration: "none" }}>
            ← Back to Lab
          </Link>
        </div>
      </div>
    </div>
  );
}

// Two-column field row: fixed label column + flexible content column
function FieldRow({ label, value, divider }: { label: string; value: string | null; divider?: boolean }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "140px 1fr", gap: "0 16px",
      alignItems: "start",
      borderTop: divider ? "1px solid #ebebeb" : "none",
      paddingTop: divider ? "14px" : 0,
      marginTop: divider ? "14px" : 0,
    }}>
      <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" as const, color: "#5a6a85", paddingTop: "2px" }}>
        {label}
      </div>
      <div style={{ fontSize: "13px", color: value ? "#1a1a1a" : "#bbb", lineHeight: 1.6 }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

// Cell inside the SARI 2x2 grid
function SariCell({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: "#94a3b8", marginBottom: "4px" }}>
        {label}
      </div>
      <div style={{ fontSize: "13px", color: value ? "#374151" : "#bbb", lineHeight: 1.55 }}>
        {value ?? "—"}
      </div>
    </div>
  );
}
