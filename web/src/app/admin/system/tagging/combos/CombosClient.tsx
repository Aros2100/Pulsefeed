"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import TaggingKpiCards from "../TaggingKpiCards";
import type { TaggingKpis } from "../TaggingKpiCards";

/* ── Types ────────────────────────────────────────────────────── */

interface ComboRule {
  id: string;
  specialty: string;
  term_1: string;
  term_2: string;
  total_decisions: number;
  approved: number;
  rejected: number;
  approve_rate: number;
  source_count: number;
  min_decisions: number;
  status: "tracking" | "draft" | "active" | "disabled";
  activated_at: string | null;
  co_occurrences: number;
  pending_count: number;
}

interface CoOccurrence {
  term_1: string;
  term_2: string;
  pair_count: number;
}

interface PendingArticle {
  article_id: string;
  title: string;
  journal_abbr: string | null;
  published_date: string | null;
  matched_combos: { term_1: string; term_2: string }[];
}

type Tab = "heatmap" | "hitlist" | "selected" | "pending" | "active";

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

/* ── Color helpers (red scale) ────────────────────────────────── */

function getColor(value: number, max: number): string {
  if (value === 0) return "#fafafa";
  const ratio = value / max;
  if (ratio > 0.75) return "#7f1d1d";
  if (ratio > 0.55) return "#991b1b";
  if (ratio > 0.4) return "#b91c1c";
  if (ratio > 0.25) return "#dc2626";
  if (ratio > 0.15) return "#ef4444";
  if (ratio > 0.08) return "#f87171";
  return "#fca5a5";
}

function getTextColor(value: number, max: number): string {
  const ratio = value / max;
  return ratio > 0.08 ? "#ffffff" : "#7f1d1d";
}

/* ── Small components ─────────────────────────────────────────── */

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

/* ── Main component ───────────────────────────────────────────── */

export default function CombosClient({
  rules,
  coOccurrences,
  pendingArticles,
  kpis,
  specialty,
}: {
  rules: ComboRule[];
  coOccurrences: CoOccurrence[];
  pendingArticles: PendingArticle[];
  kpis: TaggingKpis;
  specialty: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("heatmap");
  const [hoveredCell, setHoveredCell] = useState<{ t1: string; t2: string; val: number } | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<{ row: number; col: number } | null>(null);
  const [busyRecalc, setBusyRecalc] = useState(false);
  const [busyAddPair, setBusyAddPair] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [busyArticleId, setBusyArticleId] = useState<string | null>(null);
  const [busyBatchApprove, setBusyBatchApprove] = useState(false);
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const trackingRules = rules.filter((r) => r.status === "tracking" || r.status === "draft");
  const activeRules = rules.filter((r) => r.status === "active");

  // Set of existing rule pair keys for heatmap indicators
  const ruleStatusMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rules) m.set(`${r.term_1}|||${r.term_2}`, r.status);
    return m;
  }, [rules]);



  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  /* ── Article selection (pending tab) ─────────────────────────── */

  function toggleArticle(id: string) {
    setSelectedArticles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllArticles() {
    if (selectedArticles.size === pendingArticles.length) {
      setSelectedArticles(new Set());
    } else {
      setSelectedArticles(new Set(pendingArticles.map((a) => a.article_id)));
    }
  }

  async function handleBatchApprove() {
    if (selectedArticles.size === 0) return;
    setBusyBatchApprove(true);
    try {
      const res = await fetch("/api/admin/tagging/batch-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleIds: [...selectedArticles], specialty }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(data.error ?? "Fejl ved godkendelse", false);
        return;
      }
      showToast(`${data.approved} artikler godkendt`, true);
      setSelectedArticles(new Set());
      setTimeout(() => router.refresh(), 1000);
    } catch {
      showToast("Netv\u00e6rksfejl", false);
    } finally {
      setBusyBatchApprove(false);
    }
  }

  /* ── Heatmap data ──────────────────────────────────────────── */

  const MIN_PAIR_COUNT = 10;

  const { terms, matrix, maxCount } = useMemo(() => {
    // Supabase returns bigint as string — coerce to number
    let pairs = coOccurrences
      .map((c) => ({ ...c, pair_count: Number(c.pair_count) }))
      .filter((c) => c.pair_count >= MIN_PAIR_COUNT);

    // Keep all terms that appear in at least 1 qualifying pair (≥ MIN_PAIR_COUNT)
    // No iterative pruning needed — the pair filter already guarantees this
    const termSet = new Set<string>();
    for (const p of pairs) {
      termSet.add(p.term_1);
      termSet.add(p.term_2);
    }

    // Totals for frequency sort
    const totals = new Map<string, number>();
    for (const p of pairs) {
      totals.set(p.term_1, (totals.get(p.term_1) ?? 0) + p.pair_count);
      totals.set(p.term_2, (totals.get(p.term_2) ?? 0) + p.pair_count);
    }

    const sorted = [...totals.keys()].sort(
      (a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0)
    );

    // Build matrix
    const idx = new Map(sorted.map((t, i) => [t, i]));
    const n = sorted.length;
    const mat: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    let mx = 1;
    for (const p of pairs) {
      const i = idx.get(p.term_1)!;
      const j = idx.get(p.term_2)!;
      mat[i][j] = p.pair_count;
      mat[j][i] = p.pair_count;
      if (p.pair_count > mx) mx = p.pair_count;
    }

    return { terms: sorted, matrix: mat, maxCount: mx };
  }, [coOccurrences]);

  /* ── Actions ───────────────────────────────────────────────── */

  async function handleRecalculate() {
    setBusyRecalc(true);
    try {
      const res = await fetch("/api/admin/tagging/combos/recalculate", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(data.error ?? "Fejl ved genberegning", false);
        return;
      }
      showToast("Combo-genberegning startet i baggrunden", true);
      setTimeout(() => router.refresh(), 3000);
    } catch {
      showToast("Netv\u00e6rksfejl", false);
    } finally {
      setBusyRecalc(false);
    }
  }

  async function handleAddTracking(t1: string, t2: string, activate?: boolean) {
    setBusyAddPair(true);
    try {
      const res = await fetch("/api/admin/tagging/combos/add-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialty, term_1: t1, term_2: t2, ...(activate ? { activate: true } : {}) }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(data.error ?? "Fejl", false);
        return;
      }
      const msgs: Record<string, string> = {
        created: "Par tilf\u00f8jet",
        activated: "Combo aktiveret",
        already_tracking: "Par allerede valgt",
        already_active: "Par allerede aktivt",
        restored: "Par genaktiveret",
      };
      showToast(msgs[data.result] ?? "OK", true);
      if (data.result === "created" || data.result === "restored" || data.result === "activated") {
        setTimeout(() => router.refresh(), 800);
      }
    } catch {
      showToast("Netv\u00e6rksfejl", false);
    } finally {
      setBusyAddPair(false);
    }
  }

  async function handleActivate(ruleId: string) {
    setBusyActionId(ruleId);
    try {
      const res = await fetch("/api/admin/tagging/combos/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(data.error ?? "Fejl ved aktivering", false);
        return;
      }
      showToast("Combo aktiveret", true);
      setTimeout(() => router.refresh(), 800);
    } catch {
      showToast("Netv\u00e6rksfejl", false);
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleDelete(ruleId: string) {
    setBusyActionId(ruleId);
    try {
      const res = await fetch("/api/admin/tagging/combos/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(data.error ?? "Fejl ved sletning", false);
        return;
      }
      showToast("Par deaktiveret", true);
      setTimeout(() => router.refresh(), 800);
    } catch {
      showToast("Netv\u00e6rksfejl", false);
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleDeactivate(ruleId: string) {
    setBusyActionId(ruleId);
    try {
      const res = await fetch("/api/admin/tagging/combos/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(data.error ?? "Fejl ved deaktivering", false);
        return;
      }
      showToast("Combo deaktiveret", true);
      setTimeout(() => router.refresh(), 800);
    } catch {
      showToast("Netv\u00e6rksfejl", false);
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleArticleDecision(
    articleId: string,
    decision: "approved" | "rejected",
    matchedCombos: { term_1: string; term_2: string }[]
  ) {
    setBusyArticleId(articleId);
    try {
      const res = await fetch("/api/admin/tagging/combos/article-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, decision, specialty, matchedCombos }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(data.error ?? "Fejl", false);
        return;
      }
      showToast(decision === "approved" ? "Artikel godkendt" : "Artikel afvist", true);
      setTimeout(() => router.refresh(), 800);
    } catch {
      showToast("Netv\u00e6rksfejl", false);
    } finally {
      setBusyArticleId(null);
    }
  }

  /* ── Tabs config ───────────────────────────────────────────── */

  const hitlist = useMemo(() =>
    coOccurrences
      .map((c) => ({ ...c, pair_count: Number(c.pair_count) }))
      .filter((c) => c.pair_count >= MIN_PAIR_COUNT)
      .sort((a, b) => b.pair_count - a.pair_count),
    [coOccurrences],
  );

  const tabConfig: { key: Tab; label: string; count?: number }[] = [
    { key: "heatmap", label: "Heatmap" },
    { key: "hitlist", label: "Hitliste", count: hitlist.length },
    { key: "active", label: "Aktive par", count: activeRules.length },
    { key: "selected", label: "Valgte par", count: trackingRules.length },
    { key: "pending", label: "Klar til auto-approve", count: pendingArticles.length },
  ];

  /* ── Grid dimensions ───────────────────────────────────────── */

  const CELL = 42;
  const LABEL_W = 250;
  const LABEL_H = 180;

  /* ── Render ────────────────────────────────────────────────── */

  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      maxWidth: "1200px",
      margin: "0 auto",
      padding: "0 24px 40px",
    }}>
      {toast && <Toast toast={toast} />}

      {/* KPI cards */}
      <TaggingKpiCards kpis={kpis} />

      {/* Hover tooltip */}
      {hoveredCell && (
        <div style={{
          position: "fixed",
          top: 20,
          right: 20,
          background: "#1f2937",
          color: "#fff",
          padding: "16px 20px",
          borderRadius: 10,
          fontSize: 13,
          zIndex: 10,
          boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
          minWidth: 220,
        }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{hoveredCell.t1}</div>
          <div style={{ color: "#9ca3af", fontSize: 12, margin: "4px 0" }}>&times;</div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>{hoveredCell.t2}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#f87171", letterSpacing: "-0.03em" }}>
            {hoveredCell.val}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af" }}>co-occurrences</div>
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: "flex",
        gap: "0",
        marginBottom: "20px",
        borderBottom: "2px solid #e5e7eb",
      }}>
        {tabConfig.map((t) => {
          const isActive = tab === t.key;
          const isAction = t.key === "pending";
          const actionAccent = isAction && (t.count ?? 0) > 0;
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
              ) : t.count !== undefined ? (
                <span>({t.count})</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* ═══ Tab 1: Heatmap ═══ */}
      {tab === "heatmap" && (
        <div>
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px", alignItems: "center" }}>
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
              {busyRecalc ? "Beregner\u2026" : "Genberegn"}
            </button>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              Klik p&aring; en celle for at tilf&oslash;je parret til &quot;Valgte par&quot;
            </span>
          </div>

          {terms.length === 0 ? (
            <div style={{
              background: "#fff",
              borderRadius: "10px",
              boxShadow: SHADOW,
              padding: "40px",
              textAlign: "center",
              color: "#94a3b8",
              fontSize: "14px",
            }}>
              Ingen co-occurrences fundet. K&oslash;r &quot;Genberegn&quot; for at scanne artikler.
            </div>
          ) : (
            <>
            <div style={{
              overflowX: "auto",
              overflowY: "auto",
              maxHeight: "80vh",
              border: "1px solid #f3f4f6",
              borderRadius: 8,
              background: "#fff",
            }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `${LABEL_W}px repeat(${terms.length}, ${CELL}px)`,
                  gridTemplateRows: `${LABEL_H}px repeat(${terms.length}, ${CELL}px)`,
                  position: "relative",
                  width: "fit-content",
                }}
                onMouseLeave={() => { setHoveredIdx(null); setHoveredCell(null); }}
              >
                {/* Corner cell */}
                <div style={{
                  position: "sticky",
                  top: 0,
                  left: 0,
                  zIndex: 3,
                  background: "#fff",
                  gridRow: 1,
                  gridColumn: 1,
                }} />

                {/* Column headers */}
                {terms.map((t, i) => {
                  const isHl = hoveredIdx?.col === i;
                  return (
                    <div
                      key={`col-${i}`}
                      style={{
                        position: "sticky",
                        top: 0,
                        zIndex: 2,
                        background: hoveredIdx?.col === i ? "#EEF2F7" : "#fff",
                        gridRow: 1,
                        gridColumn: i + 2,
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "flex-end",
                        justifyContent: "center",
                        paddingBottom: 6,
                      }}
                    >
                      <span style={{
                        writingMode: "vertical-rl",
                        transform: "rotate(180deg)",
                        whiteSpace: "nowrap",
                        fontFamily: "'IBM Plex Mono', 'SF Mono', monospace",
                        fontSize: 10,
                        fontWeight: isHl ? 700 : 500,
                        color: isHl ? "#1a1a1a" : "#5a6a85",
                        lineHeight: 1,
                        maxHeight: LABEL_H - 12,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}>
                        {t}
                      </span>
                    </div>
                  );
                })}

                {/* Rows: labels + data cells */}
                {terms.map((row, ri) => {
                  const isRowHl = hoveredIdx?.row === ri;
                  return (
                    <React.Fragment key={`row-${ri}`}>
                      {/* Row label */}
                      <div style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 1,
                        background: isRowHl ? "#EEF2F7" : "#fff",
                        gridRow: ri + 2,
                        gridColumn: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        paddingRight: 10,
                        fontFamily: "'IBM Plex Mono', 'SF Mono', monospace",
                        fontSize: 11,
                        fontWeight: isRowHl ? 700 : 500,
                        color: isRowHl ? "#1a1a1a" : "#5a6a85",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                      }}>
                        {row.length > 30 ? row.slice(0, 28) + "\u2026" : row}
                      </div>

                      {/* Data cells */}
                      {terms.map((col, ci) => {
                        const val = matrix[ri][ci];
                        const isDiag = ri === ci;
                        const hasValue = !isDiag && val > 0;
                        const pairKey = row < col ? `${row}|||${col}` : `${col}|||${row}`;
                        const pairStatus = hasValue ? ruleStatusMap.get(pairKey) : undefined;
                        const isCellHovered = hoveredIdx?.row === ri && hoveredIdx?.col === ci;
                        const isInBand = hoveredIdx?.row === ri || hoveredIdx?.col === ci;

                        return (
                          <div
                            key={`cell-${ri}-${ci}`}
                            style={{
                              gridRow: ri + 2,
                              gridColumn: ci + 2,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: isInBand && !isCellHovered ? "#EEF2F7" : "transparent",
                            }}
                            onClick={() => {
                              if (hasValue && !busyAddPair) {
                                void handleAddTracking(row, col);
                              }
                            }}
                            onMouseEnter={() => {
                              setHoveredIdx({ row: ri, col: ci });
                              if (hasValue) setHoveredCell({ t1: row < col ? row : col, t2: row < col ? col : row, val });
                              else setHoveredCell(null);
                            }}
                          >
                            <div style={{
                              position: "relative",
                              width: CELL - 2,
                              height: CELL - 2,
                              borderRadius: 4,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: isCellHovered && hasValue ? "#1a1a1a" : hasValue ? getColor(val, maxCount) : "#f9fafb",
                              border: isCellHovered && hasValue
                                ? "2px solid #1a1a1a"
                                : hasValue && pairStatus
                                  ? `2px solid ${pairStatus === "active" ? "#059669" : "#0369a1"}`
                                  : "none",
                              cursor: hasValue ? "pointer" : "default",
                              transition: "all 0.1s",
                            }}>
                              {hasValue && (
                                <span style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: isCellHovered ? "#fff" : getTextColor(val, maxCount),
                                  pointerEvents: "none",
                                  fontFamily: "'IBM Plex Mono', monospace",
                                }}>
                                  {val}
                                </span>
                              )}
                              {hasValue && pairStatus && (
                                <span style={{
                                  position: "absolute",
                                  top: 2,
                                  right: 2,
                                  width: 8,
                                  height: 8,
                                  borderRadius: "50%",
                                  background: pairStatus === "active" ? "#059669" : "#2563eb",
                                  border: "1.5px solid #fff",
                                  pointerEvents: "none",
                                }} />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
              marginTop: 12,
              paddingLeft: LABEL_W,
            }}>
              {[
                { label: "0", color: "#fafafa" },
                { label: "1\u20137", color: "#fca5a5" },
                { label: "8\u201314", color: "#f87171" },
                { label: "15\u201323", color: "#ef4444" },
                { label: "24\u201337", color: "#dc2626" },
                { label: "38\u201351", color: "#b91c1c" },
                { label: "52\u201369", color: "#991b1b" },
                { label: "70+", color: "#7f1d1d" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 10 }}>
                  <span style={{ display: "inline-block", width: 16, height: 16, borderRadius: 3, background: item.color }} />
                  <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>{item.label}</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 10 }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#2563eb" }} />
                <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>Valgt</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#059669" }} />
                <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>Aktiv</span>
              </div>
            </div>
            </>
          )}
        </div>
      )}

      {/* ═══ Tab: Hitliste ═══ */}
      {tab === "hitlist" && (
        <div style={{
          background: "#fff",
          borderRadius: "10px",
          boxShadow: SHADOW,
          overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                <th style={thStyle}>Term 1</th>
                <th style={thStyle}>Term 2</th>
                <th style={thStyle}>Forekomster</th>
                <th style={{ ...thStyle, width: "100px" }}></th>
              </tr>
            </thead>
            <tbody>
              {hitlist.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>
                    Ingen co-occurrences over {MIN_PAIR_COUNT}. K&oslash;r &quot;Genberegn&quot;.
                  </td>
                </tr>
              )}
              {hitlist.map((pair, i) => {
                const pairKey = pair.term_1 < pair.term_2
                  ? `${pair.term_1}|||${pair.term_2}`
                  : `${pair.term_2}|||${pair.term_1}`;
                const isActive = ruleStatusMap.get(pairKey) === "active";
                return (
                  <tr
                    key={i}
                    style={{ borderBottom: "1px solid #f1f3f7", opacity: isActive ? 0.5 : 1 }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#f8f9fb"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                  >
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 500, color: "#1a1a1a" }}>{pair.term_1}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 500, color: "#1a1a1a" }}>{pair.term_2}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600 }}>{pair.pair_count}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      {!isActive && (
                        <button
                          onClick={() => { if (!busyAddPair) void handleAddTracking(pair.term_1, pair.term_2, true); }}
                          disabled={busyAddPair}
                          style={{
                            fontSize: "11px", fontWeight: 600, padding: "4px 12px", borderRadius: "7px",
                            border: "none", background: busyAddPair ? "#d1d5db" : "#1a1a1a",
                            color: "#fff",
                            cursor: busyAddPair ? "not-allowed" : "pointer",
                          }}
                        >
                          {busyAddPair ? "\u2026" : "Aktiv\u00e9r"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ Tab 2: Valgte par (tracking) ═══ */}
      {tab === "selected" && (
        <div style={{
          background: "#fff",
          borderRadius: "10px",
          boxShadow: SHADOW,
          overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                <th style={thStyle}>Term 1</th>
                <th style={thStyle}>Term 2</th>
                <th style={thStyle}>Co-occurrences</th>
                <th style={thStyle}>Pending</th>
                <th style={thStyle}>Approved</th>
                <th style={thStyle}>Rate</th>
                <th style={{ ...thStyle, width: "180px" }}></th>
              </tr>
            </thead>
            <tbody>
              {trackingRules.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>
                    Ingen valgte par. G&aring; til Heatmap og klik p&aring; en celle.
                  </td>
                </tr>
              )}
              {trackingRules.map((rule) => {
                const labCount = rule.approved + rule.rejected;
                const rateColor = rule.approve_rate >= 95 ? "#15803d" : rule.approve_rate >= 80 ? "#d97706" : "#dc2626";
                return (
                <tr key={rule.id} style={{ borderBottom: "1px solid #f1f3f7" }}>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 500, color: "#1a1a1a" }}>{rule.term_1}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 500, color: "#1a1a1a" }}>{rule.term_2}</span>
                  </td>
                  <td style={tdStyle}>{rule.co_occurrences}</td>
                  <td style={tdStyle}>
                    {rule.pending_count > 0 ? (
                      <span style={{ fontWeight: 600, color: "#d97706" }}>{rule.pending_count}</span>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>0</span>
                    )}
                  </td>
                  <td style={tdStyle}>{rule.co_occurrences}</td>
                  <td style={tdStyle}>
                    {labCount > 0 ? (
                      <span style={{ fontWeight: 600, color: rateColor }}>{rule.approve_rate}%</span>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>&mdash;</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => void handleActivate(rule.id)}
                      disabled={busyActionId === rule.id}
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "4px 12px",
                        borderRadius: "7px",
                        border: "none",
                        background: busyActionId === rule.id ? "#d1d5db" : "#1a1a1a",
                        color: "#fff",
                        cursor: busyActionId === rule.id ? "not-allowed" : "pointer",
                      }}
                    >
                      {busyActionId === rule.id ? "\u2026" : "Aktiv\u00e9r"}
                    </button>
                    <button
                      onClick={() => void handleDelete(rule.id)}
                      disabled={busyActionId === rule.id}
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "4px 12px",
                        borderRadius: "7px",
                        border: "1px solid #dde3ed",
                        background: "#fff",
                        color: busyActionId === rule.id ? "#94a3b8" : "#1a1a1a",
                        cursor: busyActionId === rule.id ? "not-allowed" : "pointer",
                      }}
                    >
                      {busyActionId === rule.id ? "\u2026" : "Fjern"}
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ Tab 3: Klar til auto-approve ═══ */}
      {tab === "pending" && (
        <div>
          {activeRules.length === 0 && (
            <div style={{ padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", fontSize: "13px", color: "#92400e", marginBottom: "16px" }}>
              Ingen aktive combo-par. Aktiv&eacute;r par i &quot;Valgte par&quot; for at se matchende artikler.
            </div>
          )}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "12px",
          }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#1a1a1a", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={pendingArticles.length > 0 && selectedArticles.size === pendingArticles.length}
                onChange={toggleAllArticles}
                style={{ accentColor: "#1a1a1a" }}
              />
              V&aelig;lg alle
            </label>
            {selectedArticles.size > 0 && (
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
                {busyBatchApprove ? "Godkender\u2026" : `Godkend ${selectedArticles.size} artikel${selectedArticles.size > 1 ? "er" : ""}`}
              </button>
            )}
          </div>
          <div style={{
            background: "#fff",
            borderRadius: "10px",
            boxShadow: SHADOW,
            overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: "40px" }}></th>
                  <th style={thStyle}>Titel</th>
                  <th style={{ ...thStyle, width: "100px" }}>Tidsskrift</th>
                  <th style={{ ...thStyle, width: "100px" }}>Publiceret</th>
                  <th style={thStyle}>Combo match</th>
                </tr>
              </thead>
              <tbody>
                {pendingArticles.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>
                      Ingen pending artikler matcher aktive combo-par
                    </td>
                  </tr>
                )}
                {pendingArticles.map((article) => (
                  <tr key={article.article_id} style={{ borderBottom: "1px solid #f1f3f7" }}>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={selectedArticles.has(article.article_id)}
                        onChange={() => toggleArticle(article.article_id)}
                        style={{ accentColor: "#1a1a1a" }}
                      />
                    </td>
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
                      {article.journal_abbr ?? "\u2014"}
                    </td>
                    <td style={{ ...tdStyle, fontSize: "12px", color: "#5a6a85" }}>
                      {article.published_date ?? "\u2014"}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                        {article.matched_combos.map((c, i) => (
                          <span
                            key={i}
                            style={{
                              fontSize: "10px",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: "#fef2f2",
                              color: "#991b1b",
                              border: "1px solid #fecaca",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {c.term_1} + {c.term_2}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ Tab 4: Aktive par ═══ */}
      {tab === "active" && (
        <div style={{
          background: "#fff",
          borderRadius: "10px",
          boxShadow: SHADOW,
          overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                <th style={thStyle}>Term 1</th>
                <th style={thStyle}>Term 2</th>
                <th style={thStyle}>Co-occurrences</th>
                <th style={thStyle}>Pending</th>
                <th style={thStyle}>Approved</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, width: "110px" }}></th>
              </tr>
            </thead>
            <tbody>
              {activeRules.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>
                    Ingen aktive combo-regler
                  </td>
                </tr>
              )}
              {activeRules.map((rule) => (
                <tr key={rule.id} style={{ borderBottom: "1px solid #f1f3f7" }}>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 500, color: "#1a1a1a" }}>{rule.term_1}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 500, color: "#1a1a1a" }}>{rule.term_2}</span>
                  </td>
                  <td style={tdStyle}>{rule.co_occurrences}</td>
                  <td style={tdStyle}>
                    {rule.pending_count > 0 ? (
                      <span style={{ fontWeight: 600, color: "#d97706" }}>{rule.pending_count}</span>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>0</span>
                    )}
                  </td>
                  <td style={tdStyle}>{rule.co_occurrences}</td>
                  <td style={tdStyle}>
                    <StatusBadge status={rule.status} />
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => void handleDeactivate(rule.id)}
                      disabled={busyActionId === rule.id}
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "4px 10px",
                        borderRadius: "7px",
                        border: "1px solid #dde3ed",
                        background: busyActionId === rule.id ? "#f8f9fb" : "#fff",
                        color: busyActionId === rule.id ? "#94a3b8" : "#1a1a1a",
                        cursor: busyActionId === rule.id ? "not-allowed" : "pointer",
                      }}
                    >
                      {busyActionId === rule.id ? "\u2026" : "Deaktiv\u00e9r"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
