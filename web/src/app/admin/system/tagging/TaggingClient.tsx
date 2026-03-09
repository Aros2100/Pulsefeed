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
  source_count: number;
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

type Tab = "ready" | "borderline" | "engine" | "active" | "rejected";

/* ── Constants ────────────────────────────────────────────────── */

const ACTION_ACCENT = "#E83B2A";
const INFO_ACCENT = "#64748b";
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

const tabAccent: Record<Tab, string> = {
  ready: ACTION_ACCENT,
  borderline: ACTION_ACCENT,
  engine: INFO_ACCENT,
  active: INFO_ACCENT,
  rejected: INFO_ACCENT,
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
                    style={{ accentColor: ACTION_ACCENT }}
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
          <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}>
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
            const rateColor = rule.approve_rate >= 95 ? "#059669" : rule.approve_rate >= 80 ? "#d97706" : "#dc2626";

            return (
              <tr key={rule.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                {showCheckbox && (
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={checkedIds?.has(rule.id) ?? false}
                      onChange={() => onToggleCheck?.(rule.id)}
                      style={{ accentColor: CYAN }}
                    />
                  </td>
                )}
                <td style={tdStyle}>
                  <a
                    href={`/admin/articles?mesh_term=${encodeURIComponent(rule.term)}`}
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
                        background: progress >= 100 ? CYAN : "#cbd5e1",
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
                        borderRadius: "6px",
                        border: "1px solid #e2e8f0",
                        background: actionBusyId === rule.id ? "#f8fafc" : "#fff",
                        color: actionBusyId === rule.id ? "#94a3b8" : "#64748b",
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
  const [busyDisableId, setBusyDisableId] = useState<string | null>(null);
  const [busyRejectId, setBusyRejectId] = useState<string | null>(null);
  const [busyRestoreId, setBusyRestoreId] = useState<string | null>(null);
  const [busySave, setBusySave] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  /* ── Rule groups ─────────────────────────────────────────────── */

  const trackingRules = rules.filter(
    (r) => r.status === "tracking" || r.status === "draft"
  );
  const activeRules = rules.filter((r) => r.status === "active");
  const rejectedRules = rules.filter((r) => r.status === "disabled");

  /* ── Engine tab: checkbox state — auto-check qualifying terms ── */

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
      const ruleMap = new Map(rules.map((r) => [r.term, r]));
      const articleScores: Record<string, {
        mesh_score: number;
        matched_terms: { term: string; approve_rate: number; total_decisions: number }[];
      }> = {};
      for (const a of readyArticles) {
        if (!selected.has(a.id)) continue;
        articleScores[a.id] = {
          mesh_score: a.mesh_score,
          matched_terms: a.matched_terms.map((t) => {
            const r = ruleMap.get(t);
            return { term: t, approve_rate: r?.approve_rate ?? 0, total_decisions: r?.total_decisions ?? 0 };
          }),
        };
      }

      const res = await fetch("/api/admin/tagging/batch-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleIds: [...selected], specialty, articleScores }),
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

  /* ── Engine tab: save active terms ────────────────────────────── */

  async function handleSaveTerms() {
    setBusySave(true);
    try {
      const activeIds = [...checkedTerms];
      const disableIds = trackingRules
        .filter((r) => !checkedTerms.has(r.id) && (r.status === "draft"))
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
      showToast("Term flyttet tilbage til tracking", true);
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

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "ready", label: "Klar til auto-approve", count: readyArticles.length },
    { key: "borderline", label: "Grænsetilfælde", count: borderlineArticles.length },
    { key: "engine", label: "Under motorhjelmen", count: trackingRules.length },
    { key: "active", label: "Aktive terms", count: activeRules.length },
    { key: "rejected", label: "Afviste terms", count: rejectedRules.length },
  ];

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
        <KpiCard label="Score &ge; 95" value={kpis.readyCount} accent="#059669" />
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
        {/* Gruppe 1: Artikler */}
        <div style={{
          display: "flex",
          gap: "2px",
          background: "#eff6ff",
          borderRadius: "6px 6px 0 0",
          padding: "2px 2px 0",
        }}>
          {tabs.filter((t) => t.key === "ready" || t.key === "borderline").map((t) => {
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  fontSize: "13px",
                  fontWeight: isActive ? 600 : 400,
                  padding: "8px 16px",
                  border: "none",
                  background: "transparent",
                  color: isActive ? "#334155" : INFO_ACCENT,
                  borderBottom: isActive ? `2px solid ${INFO_ACCENT}` : "2px solid transparent",
                  cursor: "pointer",
                  marginBottom: "-1px",
                }}
              >
                {t.label} ({t.count})
              </button>
            );
          })}
        </div>

        <div style={{ width: "12px" }} />

        {/* Gruppe 2: MeSH terms */}
        <div style={{
          display: "flex",
          gap: "2px",
          background: "#f1f5f9",
          borderRadius: "6px 6px 0 0",
          padding: "2px 2px 0",
        }}>
          {tabs.filter((t) => t.key === "engine" || t.key === "active" || t.key === "rejected").map((t) => {
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  fontSize: "13px",
                  fontWeight: isActive ? 600 : 400,
                  padding: "8px 16px",
                  border: "none",
                  background: "transparent",
                  color: isActive ? "#334155" : INFO_ACCENT,
                  borderBottom: isActive ? `2px solid ${INFO_ACCENT}` : "2px solid transparent",
                  cursor: "pointer",
                  marginBottom: "-1px",
                }}
              >
                {t.label} ({t.count})
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ Tab 1: Klar til auto-approve — ARTIKLER med score >= 95 ═══ */}
      {tab === "ready" && (
        <div>
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
                style={{ accentColor: ACTION_ACCENT }}
              />
              V&aelig;lg alle
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
                  background: busyApprove ? "#fca5a5" : ACTION_ACCENT,
                  color: "#fff",
                  cursor: busyApprove ? "not-allowed" : "pointer",
                }}
              >
                {busyApprove ? "Godkender…" : `Godkend ${selected.size} artikel${selected.size > 1 ? "er" : ""}`}
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

      {/* ═══ Tab 2: Grænsetilfælde — ARTIKLER med score 70–94 ═══ */}
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
            Disse artikler har score 70–94 og kr&aelig;ver manuel vurdering
          </div>

          <ArticleTable
            articles={borderlineArticles}
            scoreVariant="orange"
          />
        </div>
      )}

      {/* ═══ Tab 3: Under motorhjelmen — MeSH TERMS (tracking) ═══ */}
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
                borderRadius: "8px",
                border: "none",
                background: busySave ? "#a5b4fc" : CYAN,
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
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                background: "#fff",
                color: "#64748b",
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
          actionLabel="Deaktiv&eacute;r"
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
          actionLabel="Genaktiv&eacute;r"
          actionBusyId={busyRestoreId}
          onAction={handleRestore}
          emptyMessage="Ingen afviste terms"
        />
      )}
    </div>
  );
}
