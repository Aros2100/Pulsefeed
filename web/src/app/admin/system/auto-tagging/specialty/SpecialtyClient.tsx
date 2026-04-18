"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SpecialtyKpiCards from "./SpecialtyKpiCards";
import type { TaggingKpis } from "./SpecialtyKpiCards";

/* ── Types ────────────────────────────────────────────────────── */

interface TaggingRule {
  id: string;
  specialty: string;
  term: string;
  total_decisions: number;
  approved: number;
  rejected: number;
  approve_rate: number;
  source_count: number;
  min_decisions: number;
  status: "tracking" | "draft" | "active" | "disabled";
  activated_at: string | null;
}

interface MatchedArticle {
  article_id: string;
  title: string;
  journal_abbr: string | null;
  published_date: string | null;
  matched_terms: string[];
}

type Tab = "ready" | "engine" | "active" | "rejected";

/* ── Constants ────────────────────────────────────────────────── */

const SHADOW = "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)";

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 16px",
  fontSize: "11px",
  fontWeight: 700,
  color: "#5a6a85",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  borderBottom: "1px solid #dde3ed",
  background: "#EEF2F7",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  color: "#1a1a1a",
  borderBottom: "1px solid #f1f3f7",
  fontSize: "13px",
};

/* ── Small components ─────────────────────────────────────────── */

function MeshTag({ term }: { term: string }) {
  return (
    <span style={{
      fontSize: "11px",
      padding: "2px 7px",
      borderRadius: "4px",
      background: "#f1f5f9",
      color: "#1a1a1a",
      border: "1px solid #dde3ed",
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

/* ── Rules table sub-component ────────────────────────────────── */

function RulesTable({
  rules,
  showCheckbox,
  checkedIds,
  onToggleCheck,
  showAction,
  actionLabel,
  actionBusyId,
  onAction,
  emptyMessage,
}: {
  rules: TaggingRule[];
  showCheckbox?: boolean;
  checkedIds?: Set<string>;
  onToggleCheck?: (id: string) => void;
  showAction?: boolean;
  actionLabel?: string;
  actionBusyId?: string | null;
  onAction?: (id: string) => void;
  emptyMessage?: string;
}) {
  const colCount = 6 + (showCheckbox ? 1 : 0) + (showAction ? 1 : 0);

  return (
    <div style={{
      background: "#fff",
      borderRadius: "10px",
      boxShadow: SHADOW,
      overflow: "hidden",
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr>
            {showCheckbox && <th style={{ ...thStyle, width: "40px" }}></th>}
            <th style={thStyle}>MeSH Term</th>
            <th style={{ ...thStyle, width: "160px" }}>Beslutninger</th>
            <th style={thStyle}>Lab</th>
            <th style={thStyle}>Kilde</th>
            <th style={thStyle}>Rate</th>
            <th style={thStyle}>Status</th>
            {showAction && <th style={{ ...thStyle, width: "110px" }}></th>}
          </tr>
        </thead>
        <tbody>
          {rules.length === 0 && (
            <tr>
              <td colSpan={colCount} style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>
                {emptyMessage ?? "Ingen terms i denne kategori"}
              </td>
            </tr>
          )}
          {rules.map((rule) => {
            const progress = Math.min(100, (rule.total_decisions / rule.min_decisions) * 100);
            const labCount = rule.approved + rule.rejected;
            const hasLabData = labCount > 0;
            const rateColor = rule.approve_rate >= 95 ? "#15803d" : rule.approve_rate >= 80 ? "#d97706" : "#dc2626";

            return (
              <tr key={rule.id} style={{ borderBottom: "1px solid #f1f3f7" }}>
                {showCheckbox && (
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={checkedIds?.has(rule.id) ?? false}
                      onChange={() => onToggleCheck?.(rule.id)}
                      style={{ accentColor: "#1a1a1a" }}
                    />
                  </td>
                )}
                <td style={tdStyle}>
                  <a
                    href={`/admin/articles?mesh_term=${encodeURIComponent(rule.term)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontWeight: 600,
                      color: "#1a1a1a",
                      textDecoration: "none",
                      borderBottom: "1px solid transparent",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderBottomColor = "#1a1a1a")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderBottomColor = "transparent")}
                  >
                    {rule.term}
                  </a>
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
                        background: progress >= 100 ? "#15803d" : "#cbd5e1",
                        borderRadius: "3px",
                      }} />
                    </div>
                    <span style={{ fontSize: "11px", color: "#94a3b8", whiteSpace: "nowrap" }}>
                      {rule.total_decisions}/{rule.min_decisions}
                    </span>
                  </div>
                </td>
                <td style={tdStyle}>{labCount}</td>
                <td style={tdStyle}>{rule.source_count}</td>
                <td style={tdStyle}>
                  {hasLabData ? (
                    <span style={{ fontWeight: 600, color: rateColor }}>{rule.approve_rate}%</span>
                  ) : (
                    <span style={{ color: "#94a3b8" }}>—</span>
                  )}
                </td>
                <td style={tdStyle}>
                  <StatusBadge status={rule.status} />
                </td>
                {showAction && (
                  <td style={tdStyle}>
                    <button
                      onClick={() => onAction?.(rule.id)}
                      disabled={actionBusyId === rule.id}
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "4px 10px",
                        borderRadius: "7px",
                        border: "1px solid #dde3ed",
                        background: actionBusyId === rule.id ? "#f8f9fb" : "#fff",
                        color: actionBusyId === rule.id ? "#94a3b8" : "#1a1a1a",
                        cursor: actionBusyId === rule.id ? "not-allowed" : "pointer",
                      }}
                    >
                      {actionBusyId === rule.id ? "…" : actionLabel}
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────── */

export default function TaggingClient({
  rules,
  readyArticles,
  kpis,
  specialty,
}: {
  rules: TaggingRule[];
  readyArticles: MatchedArticle[];
  kpis: TaggingKpis;
  specialty: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("engine");
  const [busyRecalc, setBusyRecalc] = useState(false);
  const [busyDisableId, setBusyDisableId] = useState<string | null>(null);
  const [busyRejectId, setBusyRejectId] = useState<string | null>(null);
  const [busyRestoreId, setBusyRestoreId] = useState<string | null>(null);
  const [busySave, setBusySave] = useState(false);
  const [busyArticleId, setBusyArticleId] = useState<string | null>(null);
  const [busyBatchApprove, setBusyBatchApprove] = useState(false);
  const [approveProgress, setApproveProgress] = useState<{ done: number; total: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  /* ── Rule groups ─────────────────────────────────────────────── */

  const trackingRules = rules.filter(
    (r) => r.status === "tracking" || r.status === "draft"
  );
  const activeRules = rules.filter((r) => r.status === "active");
  const rejectedRules = rules.filter((r) => r.status === "disabled");

  /* ── Engine tab: checkbox state ─────────────────────────────── */

  const [checkedTerms, setCheckedTerms] = useState<Set<string>>(new Set());

  function toggleTerm(id: string) {
    setCheckedTerms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /* ── Show-all toggle for large lists ─────────────────────────── */

  const DEFAULT_SHOWN = 20;
  const [showAllTracking, setShowAllTracking] = useState(false);
  const visibleTracking = showAllTracking ? trackingRules : trackingRules.slice(0, DEFAULT_SHOWN);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  /* ── Article selection (ready tab) ───────────────────────────── */

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
      setSelected(new Set(readyArticles.map((a) => a.article_id)));
    }
  }

  async function handleBatchApprove() {
    if (selected.size === 0) return;
    const ids = [...selected];
    const total = ids.length;
    setBusyBatchApprove(true);
    setApproveProgress({ done: 0, total });

    // Start simuleret tæller
    const startTime = Date.now();
    const estimatedMs = total * 80; // ~80ms per artikel
    const ticker = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const simulated = Math.min(Math.floor((elapsed / estimatedMs) * total), total - 1);
      setApproveProgress({ done: simulated, total });
    }, 200);

    let totalApproved = 0;
    try {
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const res = await fetch("/api/admin/tagging/batch-approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articleIds: chunk, specialty }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          showToast(data.error ?? "Fejl ved godkendelse", false);
          return;
        }
        totalApproved += data.approved;
        setApproveProgress({ done: Math.min(i + 500, total), total });
      }
      showToast(`${totalApproved} artikler godkendt`, true);
      setSelected(new Set());
      setTimeout(() => router.refresh(), 1000);
    } catch {
      showToast("Netværksfejl", false);
    } finally {
      clearInterval(ticker);
      setBusyBatchApprove(false);
      setApproveProgress(null);
    }
  }

  /* ── Article decision ──────────────────────────────────────── */

  async function handleArticleDecision(
    articleId: string,
    decision: "approved" | "rejected",
    matchedTerms: string[]
  ) {
    setBusyArticleId(articleId);
    try {
      const res = await fetch("/api/admin/tagging/article-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, decision, specialty, matchedTerms }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(data.error ?? "Fejl", false);
        return;
      }
      showToast(decision === "approved" ? "Artikel godkendt" : "Artikel afvist", true);
      setTimeout(() => router.refresh(), 800);
    } catch {
      showToast("Netværksfejl", false);
    } finally {
      setBusyArticleId(null);
    }
  }

  /* ── Engine tab: save active terms ────────────────────────────── */

  async function handleSaveTerms() {
    if (checkedTerms.size === 0) return;
    setBusySave(true);
    try {
      const activeIds = [...checkedTerms];

      const res = await fetch("/api/admin/tagging/save-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeIds, disableIds: [] }),
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

  /* ── MeSH term actions ──────────────────────────────────────── */

  async function handleDeactivate(ruleId: string) {
    setBusyDisableId(ruleId);
    try {
      const res = await fetch("/api/admin/tagging/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(data.error ?? "Fejl ved deaktivering", false);
        return;
      }
      showToast("Term deaktiveret", true);
      setTimeout(() => router.refresh(), 1000);
    } catch {
      showToast("Netværksfejl", false);
    } finally {
      setBusyDisableId(null);
    }
  }

  async function handleReject(ruleId: string) {
    setBusyRejectId(ruleId);
    try {
      const res = await fetch("/api/admin/tagging/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(data.error ?? "Fejl ved afvisning", false);
        return;
      }
      showToast("Term afvist", true);
      setTimeout(() => router.refresh(), 1000);
    } catch {
      showToast("Netværksfejl", false);
    } finally {
      setBusyRejectId(null);
    }
  }

  async function handleRestore(ruleId: string) {
    setBusyRestoreId(ruleId);
    try {
      const res = await fetch("/api/admin/tagging/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(data.error ?? "Fejl ved genaktivering", false);
        return;
      }
      showToast("Term genaktiveret", true);
      setTimeout(() => router.refresh(), 1000);
    } catch {
      showToast("Netværksfejl", false);
    } finally {
      setBusyRestoreId(null);
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

  const allTabs: { key: Tab; label: string; count: number }[] = [
    { key: "engine", label: "Under motorhjelmen", count: trackingRules.length },
    { key: "active", label: "Aktive terms", count: activeRules.length },
    { key: "rejected", label: "Afviste terms", count: rejectedRules.length },
    { key: "ready", label: "Klar til auto-approve", count: readyArticles.length },
  ];

  /* ── Render article table ──────────────────────────────────── */

  function renderArticleTable(
    articles: MatchedArticle[],
    emptyMsg: string,
    opts?: {
      showCheckbox?: boolean;
      checkedIds?: Set<string>;
      onToggle?: (id: string) => void;
      hideActions?: boolean;
    }
  ) {
    const hasCheckbox = opts?.showCheckbox ?? false;
    const hasActions = !(opts?.hideActions ?? false);
    const colCount = (hasCheckbox ? 1 : 0) + 4 + (hasActions ? 1 : 0);

    return (
      <div style={{
        background: "#fff",
        borderRadius: "10px",
        boxShadow: SHADOW,
        overflow: "hidden",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr>
              {hasCheckbox && <th style={{ ...thStyle, width: "40px" }}></th>}
              <th style={thStyle}>Titel</th>
              <th style={{ ...thStyle, width: "100px" }}>Tidsskrift</th>
              <th style={{ ...thStyle, width: "100px" }}>Publiceret</th>
              <th style={thStyle}>MeSH matches</th>
              {hasActions && <th style={{ ...thStyle, width: "150px" }}></th>}
            </tr>
          </thead>
          <tbody>
            {articles.length === 0 && (
              <tr>
                <td colSpan={colCount} style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>
                  {emptyMsg}
                </td>
              </tr>
            )}
            {articles.map((article) => (
              <tr key={article.article_id} style={{ borderBottom: "1px solid #f1f3f7" }}>
                {hasCheckbox && (
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={opts?.checkedIds?.has(article.article_id) ?? false}
                      onChange={() => opts?.onToggle?.(article.article_id)}
                      style={{ accentColor: "#1a1a1a" }}
                    />
                  </td>
                )}
                <td style={tdStyle}>
                  <a
                    href={`/admin/articles/${article.article_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontWeight: 600,
                      color: "#1a1a1a",
                      textDecoration: "none",
                      borderBottom: "1px solid transparent",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderBottomColor = "#1a1a1a")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderBottomColor = "transparent")}
                  >
                    {article.title}
                  </a>
                </td>
                <td style={{ ...tdStyle, fontSize: "12px", color: "#5a6a85" }}>
                  {article.journal_abbr ?? "—"}
                </td>
                <td style={{ ...tdStyle, fontSize: "12px", color: "#5a6a85" }}>
                  {article.published_date ?? "—"}
                </td>
                <td style={tdStyle}>
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                    {article.matched_terms.map((t) => (
                      <MeshTag key={t} term={t} />
                    ))}
                  </div>
                </td>
                {hasActions && (
                  <td style={{ ...tdStyle, display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => void handleArticleDecision(article.article_id, "approved", article.matched_terms)}
                      disabled={busyArticleId === article.article_id}
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "4px 12px",
                        borderRadius: "7px",
                        border: "none",
                        background: busyArticleId === article.article_id ? "#d1d5db" : "#1a1a1a",
                        color: "#fff",
                        cursor: busyArticleId === article.article_id ? "not-allowed" : "pointer",
                      }}
                    >
                      Godkend
                    </button>
                    <button
                      onClick={() => void handleArticleDecision(article.article_id, "rejected", article.matched_terms)}
                      disabled={busyArticleId === article.article_id}
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "4px 12px",
                        borderRadius: "7px",
                        border: "1px solid #dde3ed",
                        background: "#fff",
                        color: busyArticleId === article.article_id ? "#94a3b8" : "#1a1a1a",
                        cursor: busyArticleId === article.article_id ? "not-allowed" : "pointer",
                      }}
                    >
                      Afvis
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      maxWidth: "1200px",
      margin: "0 auto",
      padding: "0 24px 40px",
    }}>
      {toast && <Toast toast={toast} />}

      {/* KPI cards */}
      <SpecialtyKpiCards kpis={kpis} />

      {/* Tabs */}
      <div style={{
        display: "flex",
        gap: "0",
        marginBottom: "20px",
        borderBottom: "2px solid #e5e7eb",
      }}>
        {allTabs.map((t) => {
          const isActive = tab === t.key;
          const isAction = t.key === "ready";
          const actionAccent = isAction && t.count > 0;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                fontSize: "13px",
                fontWeight: isActive ? 700 : 400,
                padding: "8px 16px",
                border: "none",
                background: "transparent",
                color: isActive ? (actionAccent ? "#dc2626" : "#1a1a1a") : "#5a6a85",
                borderBottom: isActive ? `2px solid ${actionAccent ? "#dc2626" : "#1a1a1a"}` : "2px solid transparent",
                cursor: "pointer",
                marginBottom: "-2px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {t.label}
              {actionAccent ? (
                <span style={{ background: "#dc2626", color: "#fff", borderRadius: "4px", padding: "1px 6px", fontSize: "10px", fontWeight: 700 }}>
                  {t.count}
                </span>
              ) : (
                <span>({t.count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ═══ Tab 1: Klar til auto-approve — ARTIKLER med aktiv single match ═══ */}
      {tab === "ready" && (
        <div>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "12px",
          }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#1a1a1a", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={readyArticles.length > 0 && selected.size === readyArticles.length}
                onChange={toggleAll}
                style={{ accentColor: "#1a1a1a" }}
              />
              V&aelig;lg alle
            </label>
            {selected.size > 0 && (
              <button
                onClick={() => void handleBatchApprove()}
                disabled={busyBatchApprove}
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  padding: "7px 18px",
                  borderRadius: "7px",
                  border: "none",
                  background: busyBatchApprove ? "#d1d5db" : "#1a1a1a",
                  color: "#fff",
                  cursor: busyBatchApprove ? "not-allowed" : "pointer",
                }}
              >
                {busyBatchApprove && approveProgress
                  ? `Godkender… ${approveProgress.done}/${approveProgress.total}`
                  : `Godkend ${selected.size} artikel${selected.size > 1 ? "er" : ""}`}
              </button>
            )}
          </div>
          {renderArticleTable(readyArticles, "Ingen pending artikler matcher aktive single terms", {
            showCheckbox: true,
            checkedIds: selected,
            onToggle: toggleArticle,
            hideActions: true,
          })}
        </div>
      )}

      {/* ═══ Tab 2: Under motorhjelmen — MeSH TERMS (tracking) ═══ */}
      {tab === "engine" && (
        <div>
          <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
            <button
              onClick={() => void handleSaveTerms()}
              disabled={busySave}
              style={{
                fontSize: "13px",
                fontWeight: 600,
                padding: "8px 18px",
                borderRadius: "7px",
                border: "none",
                background: busySave ? "#d1d5db" : "#1a1a1a",
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
                borderRadius: "7px",
                border: "1px solid #dde3ed",
                background: busyRecalc ? "#f8f9fb" : "#fff",
                color: busyRecalc ? "#94a3b8" : "#1a1a1a",
                cursor: busyRecalc ? "not-allowed" : "pointer",
              }}
            >
              {busyRecalc ? "Beregner…" : "Genberegn"}
            </button>
          </div>

          <RulesTable
            rules={visibleTracking}
            showCheckbox
            checkedIds={checkedTerms}
            onToggleCheck={toggleTerm}
            showAction
            actionLabel="Afvis"
            actionBusyId={busyRejectId}
            onAction={handleReject}
            emptyMessage="Ingen terms under tracking"
          />

          {trackingRules.length > DEFAULT_SHOWN && (
            <button
              onClick={() => setShowAllTracking((v) => !v)}
              style={{
                display: "block",
                margin: "12px auto 0",
                fontSize: "13px",
                fontWeight: 500,
                padding: "8px 16px",
                border: "1px solid #dde3ed",
                borderRadius: "7px",
                background: "#fff",
                color: "#1a1a1a",
                cursor: "pointer",
              }}
            >
              {showAllTracking ? "Vis top 20" : `Vis alle ${trackingRules.length} terms`}
            </button>
          )}
        </div>
      )}

      {/* ═══ Tab 4: Aktive terms — MeSH TERMS (active) ═══ */}
      {tab === "active" && (
        <RulesTable
          rules={activeRules}
          showAction
          actionLabel="Deaktivér"
          actionBusyId={busyDisableId}
          onAction={handleDeactivate}
          emptyMessage="Ingen aktive terms"
        />
      )}

      {/* ═══ Tab 5: Afviste terms — MeSH TERMS (disabled) ═══ */}
      {tab === "rejected" && (
        <RulesTable
          rules={rejectedRules}
          showAction
          actionLabel="Genaktivér"
          actionBusyId={busyRestoreId}
          onAction={handleRestore}
          emptyMessage="Ingen afviste terms"
        />
      )}
    </div>
  );
}
