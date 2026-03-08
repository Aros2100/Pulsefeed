"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ScoredArticle } from "@/lib/tagging/auto-tagger";

/* ── Types ────────────────────────────────────────────────────── */

interface TaggingRule {
  id: string;
  specialty: string;
  term: string;
  total_decisions: number;
  approved: number;
  rejected: number;
  approve_rate: number;
  min_decisions: number;
  status: "tracking" | "draft" | "active" | "disabled";
  activated_at: string | null;
}

interface KPIs {
  totalPending: number;
  readyCount: number;
  borderlineCount: number;
  noMatchCount: number;
}

type Tab = "ready" | "borderline" | "engine";

/* ── Constants ────────────────────────────────────────────────── */

const CYAN = "#0891b2";
const SHADOW = "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)";

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 14px",
  fontSize: "11px",
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  color: "#475569",
};

/* ── Small components ─────────────────────────────────────────── */

function KpiCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: "10px",
      boxShadow: SHADOW,
      padding: "20px 28px",
      minWidth: "150px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: "28px", fontWeight: 700, color: accent ?? "#1a1a1a" }}>
        {value}
      </div>
      <div style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>{label}</div>
    </div>
  );
}

function ScoreBadge({ score, variant }: { score: number; variant: "green" | "orange" }) {
  const bg = variant === "green" ? "#ecfdf5" : "#fffbeb";
  const fg = variant === "green" ? "#059669" : "#d97706";
  const border = variant === "green" ? "#a7f3d0" : "#fde68a";
  return (
    <span style={{
      fontSize: "12px",
      fontWeight: 700,
      padding: "2px 8px",
      borderRadius: "6px",
      background: bg,
      color: fg,
      border: `1px solid ${border}`,
    }}>
      {score.toFixed(1)}
    </span>
  );
}

function MeshTag({ term }: { term: string }) {
  return (
    <span style={{
      fontSize: "11px",
      padding: "2px 7px",
      borderRadius: "4px",
      background: "#f0fdfa",
      color: CYAN,
      border: "1px solid #ccfbf1",
      whiteSpace: "nowrap",
    }}>
      {term}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string; border: string }> = {
    tracking: { bg: "#f0f9ff", fg: "#0369a1", border: "#bae6fd" },
    draft: { bg: "#fffbeb", fg: "#92400e", border: "#fde68a" },
    active: { bg: "#ecfdf5", fg: "#065f46", border: "#a7f3d0" },
    disabled: { bg: "#f1f5f9", fg: "#64748b", border: "#e2e8f0" },
  };
  const c = colors[status] ?? colors.disabled;
  return (
    <span style={{
      fontSize: "11px",
      fontWeight: 600,
      padding: "3px 10px",
      borderRadius: "6px",
      background: c.bg,
      color: c.fg,
      border: `1px solid ${c.border}`,
      textTransform: "capitalize",
    }}>
      {status}
    </span>
  );
}

function Toast({ toast }: { toast: { msg: string; ok: boolean } }) {
  return (
    <div style={{
      position: "fixed",
      top: "20px",
      right: "20px",
      zIndex: 1000,
      fontSize: "13px",
      fontWeight: 500,
      padding: "10px 18px",
      borderRadius: "8px",
      background: toast.ok ? "#f0fdf4" : "#fef2f2",
      color: toast.ok ? "#14532d" : "#991b1b",
      border: `1px solid ${toast.ok ? "#bbf7d0" : "#fecaca"}`,
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    }}>
      {toast.msg}
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────── */

export default function TaggingClient({
  rules,
  readyArticles,
  borderlineArticles,
  kpis,
  specialty,
}: {
  rules: TaggingRule[];
  readyArticles: ScoredArticle[];
  borderlineArticles: ScoredArticle[];
  kpis: KPIs;
  specialty: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("ready");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyApprove, setBusyApprove] = useState(false);
  const [busyRecalc, setBusyRecalc] = useState(false);
  const [busySave, setBusySave] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Engine tab: checkbox state — auto-check qualifying terms
  const [checkedTerms, setCheckedTerms] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const r of rules) {
      if (r.status === "active" || (r.approve_rate === 100 && r.total_decisions >= r.min_decisions)) {
        initial.add(r.id);
      }
    }
    return initial;
  });
  const [showAllTerms, setShowAllTerms] = useState(false);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  /* ── Article selection (Tab 1) ──────────────────────────────── */

  function toggleArticle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === readyArticles.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(readyArticles.map((a) => a.id)));
    }
  }

  async function handleBatchApprove() {
    if (selected.size === 0) return;
    setBusyApprove(true);
    try {
      const res = await fetch("/api/admin/tagging/batch-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleIds: [...selected], specialty }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(data.error ?? "Fejl ved godkendelse", false);
        return;
      }
      showToast(`${data.approved} artikler godkendt`, true);
      setSelected(new Set());
      setTimeout(() => router.refresh(), 1000);
    } catch {
      showToast("Netværksfejl", false);
    } finally {
      setBusyApprove(false);
    }
  }

  /* ── Engine tab actions ─────────────────────────────────────── */

  function toggleTerm(id: string) {
    setCheckedTerms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSaveTerms() {
    setBusySave(true);
    try {
      const activeIds = [...checkedTerms];
      const disableIds = rules
        .filter((r) => !checkedTerms.has(r.id) && (r.status === "active" || r.status === "draft"))
        .map((r) => r.id);

      const res = await fetch("/api/admin/tagging/save-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeIds, disableIds }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(data.error ?? "Fejl ved gem", false);
        return;
      }
      showToast("Aktive terms gemt", true);
      setTimeout(() => router.refresh(), 1000);
    } catch {
      showToast("Netværksfejl", false);
    } finally {
      setBusySave(false);
    }
  }

  async function handleRecalculate() {
    setBusyRecalc(true);
    try {
      const res = await fetch("/api/admin/tagging/recalculate", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(data.error ?? "Fejl ved genberegning", false);
        return;
      }
      showToast("Genberegning startet i baggrunden", true);
      setTimeout(() => router.refresh(), 3000);
    } catch {
      showToast("Netværksfejl", false);
    } finally {
      setBusyRecalc(false);
    }
  }

  /* ── Tabs config ────────────────────────────────────────────── */

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "ready", label: "Klar til auto-approve", count: kpis.readyCount },
    { key: "borderline", label: "Grænsetilfælde", count: kpis.borderlineCount },
    { key: "engine", label: "Under motorhjelmen", count: rules.length },
  ];

  const DEFAULT_TERMS_SHOWN = 20;
  const visibleRules = showAllTerms ? rules : rules.slice(0, DEFAULT_TERMS_SHOWN);

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      maxWidth: "1200px",
      margin: "0 auto",
      padding: "40px 24px",
    }}>
      {toast && <Toast toast={toast} />}

      {/* Header */}
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a1a", margin: "0 0 28px" }}>
        Auto-Tagging
      </h1>

      {/* KPI cards */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "28px", flexWrap: "wrap" }}>
        <KpiCard label="Total pending" value={kpis.totalPending} />
        <KpiCard label="Score ≥ 95" value={kpis.readyCount} accent="#059669" />
        <KpiCard label="Score 70–94" value={kpis.borderlineCount} accent="#d97706" />
        <KpiCard label="Ingen MeSH match" value={kpis.noMatchCount} />
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex",
        gap: "4px",
        marginBottom: "20px",
        borderBottom: "1px solid #e5e7eb",
      }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              fontSize: "13px",
              fontWeight: tab === t.key ? 600 : 400,
              padding: "8px 16px",
              border: "none",
              background: "none",
              color: tab === t.key ? CYAN : "#64748b",
              borderBottom: tab === t.key ? `2px solid ${CYAN}` : "2px solid transparent",
              cursor: "pointer",
              marginBottom: "-1px",
            }}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* ═══ Tab 1: Ready to approve ═══ */}
      {tab === "ready" && (
        <div>
          {/* Batch action bar */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "12px",
          }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#475569", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={readyArticles.length > 0 && selected.size === readyArticles.length}
                onChange={toggleAll}
                style={{ accentColor: CYAN }}
              />
              Vælg alle
            </label>
            {selected.size > 0 && (
              <button
                onClick={() => void handleBatchApprove()}
                disabled={busyApprove}
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  padding: "7px 18px",
                  borderRadius: "8px",
                  border: "none",
                  background: busyApprove ? "#a5f3fc" : CYAN,
                  color: "#fff",
                  cursor: busyApprove ? "not-allowed" : "pointer",
                }}
              >
                {busyApprove ? "Godkender…" : `Godkend ${selected.size} artikel${selected.size > 1 ? "er" : ""} →`}
              </button>
            )}
          </div>

          <ArticleTable
            articles={readyArticles}
            selected={selected}
            onToggle={toggleArticle}
            showCheckbox
            scoreVariant="green"
          />
        </div>
      )}

      {/* ═══ Tab 2: Borderline ═══ */}
      {tab === "borderline" && (
        <div>
          <div style={{
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "8px",
            padding: "10px 16px",
            fontSize: "13px",
            color: "#92400e",
            marginBottom: "16px",
          }}>
            Disse artikler sendes til AI scoring og Lab
          </div>

          <ArticleTable
            articles={borderlineArticles}
            scoreVariant="orange"
          />
        </div>
      )}

      {/* ═══ Tab 3: Under the hood ═══ */}
      {tab === "engine" && (
        <div>
          {/* Action buttons */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
            <button
              onClick={() => void handleSaveTerms()}
              disabled={busySave}
              style={{
                fontSize: "13px",
                fontWeight: 600,
                padding: "8px 18px",
                borderRadius: "8px",
                border: "none",
                background: busySave ? "#a5f3fc" : CYAN,
                color: "#fff",
                cursor: busySave ? "not-allowed" : "pointer",
              }}
            >
              {busySave ? "Gemmer…" : "Gem aktive terms"}
            </button>
            <button
              onClick={() => void handleRecalculate()}
              disabled={busyRecalc}
              style={{
                fontSize: "13px",
                fontWeight: 600,
                padding: "8px 18px",
                borderRadius: "8px",
                border: `1px solid ${CYAN}`,
                background: busyRecalc ? "#f0fdfa" : "#fff",
                color: busyRecalc ? "#94a3b8" : CYAN,
                cursor: busyRecalc ? "not-allowed" : "pointer",
              }}
            >
              {busyRecalc ? "Beregner…" : "Genberegn"}
            </button>
          </div>

          {/* Terms table */}
          <div style={{
            background: "#fff",
            borderRadius: "10px",
            boxShadow: SHADOW,
            overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ ...thStyle, width: "40px" }}></th>
                  <th style={thStyle}>MeSH Term</th>
                  <th style={{ ...thStyle, width: "160px" }}>Beslutninger</th>
                  <th style={thStyle}>Approved</th>
                  <th style={thStyle}>Rejected</th>
                  <th style={thStyle}>Rate</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleRules.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>
                      Ingen terms fundet — kør &ldquo;Genberegn&rdquo; først
                    </td>
                  </tr>
                )}
                {visibleRules.map((rule) => {
                  const progress = Math.min(100, (rule.total_decisions / rule.min_decisions) * 100);
                  const rateColor = rule.approve_rate >= 95 ? "#059669" : rule.approve_rate >= 80 ? "#d97706" : "#dc2626";

                  return (
                    <tr key={rule.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={checkedTerms.has(rule.id)}
                          onChange={() => toggleTerm(rule.id)}
                          style={{ accentColor: CYAN }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 500, color: "#1a1a1a" }}>{rule.term}</span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{
                            flex: 1,
                            height: "6px",
                            background: "#f1f5f9",
                            borderRadius: "3px",
                            overflow: "hidden",
                          }}>
                            <div style={{
                              width: `${progress}%`,
                              height: "100%",
                              background: progress >= 100 ? CYAN : "#cbd5e1",
                              borderRadius: "3px",
                            }} />
                          </div>
                          <span style={{ fontSize: "11px", color: "#94a3b8", whiteSpace: "nowrap" }}>
                            {rule.total_decisions}/{rule.min_decisions}
                          </span>
                        </div>
                      </td>
                      <td style={tdStyle}>{rule.approved}</td>
                      <td style={tdStyle}>{rule.rejected}</td>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600, color: rateColor }}>{rule.approve_rate}%</span>
                      </td>
                      <td style={tdStyle}>
                        <StatusBadge status={rule.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Show all toggle */}
          {rules.length > DEFAULT_TERMS_SHOWN && (
            <button
              onClick={() => setShowAllTerms((v) => !v)}
              style={{
                display: "block",
                margin: "12px auto 0",
                fontSize: "13px",
                fontWeight: 500,
                padding: "8px 16px",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                background: "#fff",
                color: "#64748b",
                cursor: "pointer",
              }}
            >
              {showAllTerms ? "Vis top 20" : `Vis alle ${rules.length} terms`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Article table sub-component ──────────────────────────────── */

function ArticleTable({
  articles,
  selected,
  onToggle,
  showCheckbox,
  scoreVariant,
}: {
  articles: ScoredArticle[];
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  showCheckbox?: boolean;
  scoreVariant: "green" | "orange";
}) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: "10px",
      boxShadow: SHADOW,
      overflow: "hidden",
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}>
            {showCheckbox && <th style={{ ...thStyle, width: "40px" }}></th>}
            <th style={thStyle}>Titel</th>
            <th style={{ ...thStyle, width: "100px" }}>Journal</th>
            <th style={{ ...thStyle, width: "100px" }}>Publiceret</th>
            <th style={{ ...thStyle, width: "70px" }}>Score</th>
            <th style={thStyle}>MeSH matches</th>
          </tr>
        </thead>
        <tbody>
          {articles.length === 0 && (
            <tr>
              <td
                colSpan={showCheckbox ? 6 : 5}
                style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}
              >
                Ingen artikler i denne kategori
              </td>
            </tr>
          )}
          {articles.map((a) => (
            <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
              {showCheckbox && (
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={selected?.has(a.id) ?? false}
                    onChange={() => onToggle?.(a.id)}
                    style={{ accentColor: CYAN }}
                  />
                </td>
              )}
              <td style={tdStyle}>
                <a
                  href={`/admin/articles/${a.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontWeight: 500,
                    color: "#1a1a1a",
                    textDecoration: "none",
                    borderBottom: "1px solid transparent",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderBottomColor = CYAN)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderBottomColor = "transparent")}
                >
                  {a.title}
                </a>
              </td>
              <td style={{ ...tdStyle, fontSize: "12px", color: "#64748b" }}>
                {a.journal_abbr ?? "—"}
              </td>
              <td style={{ ...tdStyle, fontSize: "12px", color: "#64748b" }}>
                {a.published_date ?? "—"}
              </td>
              <td style={tdStyle}>
                <ScoreBadge score={a.mesh_score} variant={scoreVariant} />
              </td>
              <td style={tdStyle}>
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                  {a.matched_terms.map((t) => (
                    <MeshTag key={t} term={t} />
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
