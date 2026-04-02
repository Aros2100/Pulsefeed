"use client";

import { useState, useMemo } from "react";
import { ARTICLE_TYPE_OPTIONS } from "@/lib/lab/article-type-options";

/* ── PubMed publication types ───────────────────────────────────── */

const PUBMED_PUBLICATION_TYPES = [
  "Adaptive Clinical Trial",
  "Address",
  "Autobiography",
  "Bibliography",
  "Biography",
  "Case Reports",
  "Classical Article",
  "Clinical Conference",
  "Clinical Study",
  "Clinical Trial",
  "Clinical Trial Protocol",
  "Clinical Trial, Phase I",
  "Clinical Trial, Phase II",
  "Clinical Trial, Phase III",
  "Clinical Trial, Phase IV",
  "Collected Work",
  "Comment",
  "Comparative Study",
  "Congress",
  "Consensus Development Conference",
  "Consensus Development Conference, NIH",
  "Controlled Clinical Trial",
  "Corrected and Republished Article",
  "Dataset",
  "Dictionary",
  "Directory",
  "Duplicate Publication",
  "Editorial",
  "English Abstract",
  "Equivalence Trial",
  "Evaluation Study",
  "Expression of Concern",
  "Festschrift",
  "Government Publication",
  "Guideline",
  "Historical Article",
  "Interactive Tutorial",
  "Interview",
  "Introductory Journal Article",
  "Journal Article",
  "Legal Case",
  "Legislation",
  "Letter",
  "Meta-Analysis",
  "Multicenter Study",
  "News",
  "Newspaper Article",
  "Observational Study",
  "Overall",
  "Patient Education Handout",
  "Personal Narrative",
  "Portrait",
  "Practice Guideline",
  "Pragmatic Clinical Trial",
  "Preprint",
  "Published Erratum",
  "Randomized Controlled Trial",
  "Retracted Publication",
  "Retraction of Publication",
  "Review",
  "Scientific Integrity Review",
  "Systematic Review",
  "Technical Report",
  "Twin Study",
  "Validation Study",
  "Video-Audio Media",
  "Webcast",
] as const;

/* ── Types ──────────────────────────────────────────────────────── */

type Rule = {
  id: string;
  publication_type: string;
  article_type: string;
  is_active: boolean;
};

type PendingArticle = {
  id: string;
  title: string;
  journal_abbr: string | null;
  published_date: string | null;
  article_type_ai: string | null;
  article_type_confidence: number | null;
  publication_types: string[] | null;
};

type ScoringState =
  | { status: "idle" }
  | { status: "running"; scored: number; total: number }
  | { status: "done"; scored: number; skipped: number }
  | { status: "error"; message: string };

/* ── Constants ──────────────────────────────────────────────────── */

const SHADOW = "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)";

/* ── Toast ──────────────────────────────────────────────────────── */

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

/* ── Main component ─────────────────────────────────────────────── */

export default function ArticleTypeAdminClient({
  pending,
  deterministic,
  initialRules,
  pendingApproval,
  pendingApprovalCount,
}: {
  pending: number;
  deterministic: number;
  initialRules: Rule[];
  pendingApproval: PendingArticle[];
  pendingApprovalCount: number;
}) {
  const [rules,           setRules]           = useState<Rule[]>(initialRules);
  const [activeTab,       setActiveTab]       = useState<string>(ARTICLE_TYPE_OPTIONS[0]);
  const [scoring,         setScoring]         = useState<ScoringState>({ status: "idle" });
  const [toast,           setToast]           = useState<{ msg: string; ok: boolean } | null>(null);
  const [newPubType,      setNewPubType]      = useState("");
  const [busyAdd,         setBusyAdd]         = useState(false);
  const [busyDeleteId,    setBusyDeleteId]    = useState<string | null>(null);
  const [hoveredFjernId,  setHoveredFjernId]  = useState<string | null>(null);
  const [hoveredRowId,    setHoveredRowId]    = useState<string | null>(null);

  /* ── Pending approval state ─────────────────────────────────── */
  const [view,            setView]            = useState<"rules" | "pending">("rules");
  const [pendingList,     setPendingList]     = useState<PendingArticle[]>(pendingApproval);
  const [pendingFilter,   setPendingFilter]   = useState<string>("All");
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set());
  const [approving,       setApproving]       = useState(false);

  /* ── Derived state ──────────────────────────────────────────── */

  const grouped = useMemo(() => {
    const map: Record<string, Rule[]> = Object.fromEntries(
      ARTICLE_TYPE_OPTIONS.map((opt) => [opt, [] as Rule[]])
    );
    for (const rule of rules) {
      map[rule.article_type]?.push(rule);
    }
    return map;
  }, [rules]);

  const assignedTypes = useMemo(
    () => new Set(rules.map((r) => r.publication_type)),
    [rules]
  );

  const availableTypes = (PUBMED_PUBLICATION_TYPES as readonly string[]).filter(
    (t) => !assignedTypes.has(t)
  );

  const activeRules = grouped[activeTab] ?? [];

  /* ── Pending approval derived ───────────────────────────────── */

  const pendingCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of pendingList) {
      const t = a.article_type_ai ?? "Unknown";
      map[t] = (map[t] ?? 0) + 1;
    }
    return map;
  }, [pendingList]);

  const filteredPending = useMemo(
    () => pendingFilter === "All"
      ? pendingList
      : pendingList.filter((a) => a.article_type_ai === pendingFilter),
    [pendingList, pendingFilter]
  );

  const allFilteredSelected =
    filteredPending.length > 0 && filteredPending.every((a) => selectedIds.has(a.id));

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredPending.forEach((a) => next.delete(a.id));
      } else {
        filteredPending.forEach((a) => next.add(a.id));
      }
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  /* ── Helpers ────────────────────────────────────────────────── */

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  /* ── Scoring (unchanged) ────────────────────────────────────── */

  async function handleRunScoring() {
    setScoring({ status: "running", scored: 0, total: 0 });
    try {
      const res = await fetch("/api/lab/score-article-type-deterministic", { method: "POST" });
      if (!res.ok || !res.body) {
        setScoring({ status: "error", message: "Request failed" });
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6)) as {
              scored?: number;
              total?: number;
              done?: boolean;
              skipped?: number;
              error?: string;
            };
            if (payload.done) {
              if (payload.error) {
                setScoring({ status: "error", message: payload.error });
              } else {
                setScoring({ status: "done", scored: payload.scored ?? 0, skipped: payload.skipped ?? 0 });
              }
            } else {
              setScoring({ status: "running", scored: payload.scored ?? 0, total: payload.total ?? 0 });
            }
          } catch { /* malformed line */ }
        }
      }
    } catch (e) {
      setScoring({ status: "error", message: String(e) });
    }
  }

  /* ── Delete (unchanged) ─────────────────────────────────────── */

  async function handleDelete(rule: Rule) {
    if (!confirm(`Slet regel "${rule.publication_type} → ${rule.article_type}"?`)) return;
    setBusyDeleteId(rule.id);
    try {
      const res = await fetch("/api/admin/article-type-rules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) { showToast(data.error ?? "Fejl", false); return; }
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
      showToast("Regel slettet", true);
    } catch {
      showToast("Netværksfejl", false);
    } finally {
      setBusyDeleteId(null);
    }
  }

  /* ── Add rule (article_type = activeTab) ────────────────────── */

  async function handleAddRule() {
    if (!newPubType) return;
    setBusyAdd(true);
    try {
      const res = await fetch("/api/admin/article-type-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publication_type: newPubType, article_type: activeTab }),
      });
      const data = await res.json() as { ok: boolean; error?: string; data?: Rule };
      if (!res.ok || !data.ok) { showToast(data.error ?? "Fejl ved tilføjelse", false); return; }
      setRules((prev) => [...prev, data.data!]);
      setNewPubType("");
      showToast("Regel tilføjet", true);
    } catch {
      showToast("Netværksfejl", false);
    } finally {
      setBusyAdd(false);
    }
  }

  /* ── Batch approve ──────────────────────────────────────────── */

  async function handleApprove() {
    if (selectedIds.size === 0) return;
    setApproving(true);
    const ids = [...selectedIds];
    try {
      const res = await fetch("/api/admin/article-type/batch-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleIds: ids }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) { showToast(data.error ?? "Fejl", false); return; }
      setPendingList((prev) => prev.filter((a) => !selectedIds.has(a.id)));
      setSelectedIds(new Set());
      showToast(`${ids.length} artikler godkendt`, true);
    } catch {
      showToast("Netværksfejl", false);
    } finally {
      setApproving(false);
    }
  }

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <div style={{
      fontFamily: "Inter, sans-serif",
      maxWidth: "1200px",
      margin: "0 auto",
      padding: "0 24px 40px",
    }}>
      {toast && <Toast toast={toast} />}

      {/* ── Scoring button row ──────────────────────────────────── */}
      {view === "rules" && <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        {scoring.status === "running" && (
          <span style={{ fontSize: "12px", color: "#5a6a85" }}>
            {scoring.scored} / {scoring.total}…
          </span>
        )}
        {scoring.status === "done" && (
          <span style={{ fontSize: "12px", color: "#3B6D11", fontWeight: 500 }}>
            {scoring.scored} scoret, {scoring.skipped} sprunget
          </span>
        )}
        {scoring.status === "error" && (
          <span style={{ fontSize: "12px", color: "#991b1b" }}>Fejl</span>
        )}
        <button
          type="button"
          onClick={() => void handleRunScoring()}
          disabled={scoring.status === "running"}
          style={{
            fontSize: "13px",
            fontWeight: 600,
            padding: "8px 18px",
            borderRadius: "7px",
            border: "none",
            background: scoring.status === "running" ? "#e2e8f0" : "#1a1a1a",
            color: scoring.status === "running" ? "#94a3b8" : "#fff",
            cursor: scoring.status === "running" ? "not-allowed" : "pointer",
          }}
        >
          {scoring.status === "running" ? "Kører…" : "Kør scoring"}
        </button>
      </div>}

      {/* ── KPIs ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
        {([
          { label: "Afventer scoring",      value: pending,              color: "#BA7517" },
          { label: "Afventer godkendelse",  value: pendingList.length,   color: "#b45309" },
          { label: "Deterministisk scoret", value: deterministic,        color: "#3B6D11" },
        ] as const).map((kpi) => (
          <div key={kpi.label} style={{
            background: "#fff",
            borderRadius: "10px",
            boxShadow: SHADOW,
            padding: "20px 28px",
            flex: "1 1 160px",
          }}>
            <div style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#5a6a85",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: "8px",
            }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: kpi.color }}>
              {kpi.value.toLocaleString("da-DK")}
            </div>
          </div>
        ))}
      </div>

      {/* ── View switcher ────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        {(["rules", "pending"] as const).map((v) => {
          const label = v === "rules" ? "Regler" : `Pending godkendelse (${pendingList.length.toLocaleString("da-DK")})`;
          const isActive = view === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              style={{
                fontSize: "13px",
                fontWeight: isActive ? 700 : 500,
                padding: "7px 18px",
                borderRadius: "7px",
                border: isActive ? "none" : "1px solid #dde3ed",
                background: isActive ? "#1a1a1a" : "#fff",
                color: isActive ? "#fff" : "#5a6a85",
                cursor: "pointer",
                boxShadow: isActive ? SHADOW : "none",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Main rules card ──────────────────────────────────────── */}
      {view === "pending" && (
        <div style={{ background: "#fff", borderRadius: "10px", boxShadow: SHADOW, overflow: "hidden" }}>
          {/* Filter + approve bar */}
          <div style={{
            padding: "14px 20px",
            borderBottom: "1px solid #dde3ed",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}>
            <select
              value={pendingFilter}
              onChange={(e) => { setPendingFilter(e.target.value); setSelectedIds(new Set()); }}
              style={{
                fontSize: "13px",
                border: "1px solid #dde3ed",
                borderRadius: "7px",
                padding: "6px 12px",
                background: "#fff",
                color: "#1a1a1a",
                cursor: "pointer",
                fontFamily: "Inter, sans-serif",
                outline: "none",
              }}
            >
              <option value="All">Alle kategorier ({pendingList.length.toLocaleString("da-DK")})</option>
              {Object.entries(pendingCounts)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([type, count]) => (
                  <option key={type} value={type}>{type} ({count.toLocaleString("da-DK")})</option>
                ))}
            </select>
            <span style={{ fontSize: "12px", color: "#94a3b8", marginLeft: "auto" }}>
              {selectedIds.size > 0 && `${selectedIds.size} valgt`}
            </span>
            <button
              type="button"
              onClick={() => void handleApprove()}
              disabled={selectedIds.size === 0 || approving}
              style={{
                fontSize: "13px",
                fontWeight: 600,
                padding: "7px 18px",
                borderRadius: "7px",
                border: "none",
                background: selectedIds.size === 0 || approving ? "#e2e8f0" : "#3B6D11",
                color: selectedIds.size === 0 || approving ? "#94a3b8" : "#fff",
                cursor: selectedIds.size === 0 || approving ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {approving ? "Godkender…" : `Godkend valgte (${selectedIds.size})`}
            </button>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #dde3ed" }}>
                  <th style={{ padding: "10px 16px", textAlign: "left", width: "36px" }}>
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      style={{ cursor: "pointer" }}
                    />
                  </th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#5a6a85" }}>Titel</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#5a6a85", whiteSpace: "nowrap" }}>Journal</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#5a6a85", whiteSpace: "nowrap" }}>Artikel type</th>
                  <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "#5a6a85", whiteSpace: "nowrap" }}>Confidence</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#5a6a85" }}>Publication types</th>
                </tr>
              </thead>
              <tbody>
                {filteredPending.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>
                      {pendingList.length === 0 ? "Ingen artikler afventer godkendelse" : "Ingen artikler i denne kategori"}
                    </td>
                  </tr>
                ) : (
                  filteredPending.map((article) => {
                    const isSelected = selectedIds.has(article.id);
                    const pubTypes = (article.publication_types ?? []).join(", ");
                    return (
                      <tr
                        key={article.id}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          background: isSelected ? "#f0fdf4" : undefined,
                        }}
                      >
                        <td style={{ padding: "10px 16px" }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(article.id)}
                            style={{ cursor: "pointer" }}
                          />
                        </td>
                        <td style={{ padding: "10px 16px", maxWidth: "360px" }}>
                          <span style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            lineHeight: 1.4,
                            color: "#1a1a1a",
                          }}>
                            {article.title}
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px", color: "#5a6a85", whiteSpace: "nowrap" }}>
                          {article.journal_abbr ?? "—"}
                        </td>
                        <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                          <span style={{
                            display: "inline-block",
                            padding: "2px 9px",
                            borderRadius: "5px",
                            fontSize: "11px",
                            fontWeight: 600,
                            background: "#f1f5f9",
                            color: "#334155",
                          }}>
                            {article.article_type_ai ?? "—"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right", color: "#5a6a85", whiteSpace: "nowrap" }}>
                          {article.article_type_confidence != null ? `${article.article_type_confidence}%` : "—"}
                        </td>
                        <td style={{ padding: "10px 16px", color: "#64748b", fontSize: "12px" }}>
                          {pubTypes || "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "rules" && <div style={{
        background: "#fff",
        borderRadius: "10px",
        boxShadow: SHADOW,
        overflow: "hidden",
      }}>

        {/* Tab bar */}
        <div style={{
          display: "flex",
          background: "#EEF2F7",
          borderBottom: "2px solid #dde3ed",
          overflowX: "auto",
        }}>
          {ARTICLE_TYPE_OPTIONS.map((tab) => {
              const isActive = tab === activeTab;
              const count = grouped[tab]?.length ?? 0;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: "10px 16px",
                    fontSize: "13px",
                    fontWeight: isActive ? 700 : 400,
                    color: isActive ? "#1a1a1a" : "#5a6a85",
                    borderTop: isActive ? "2px solid #1a1a1a" : "2px solid transparent",
                    borderLeft: isActive ? "1px solid #dde3ed" : "1px solid transparent",
                    borderRight: isActive ? "1px solid #dde3ed" : "1px solid transparent",
                    borderBottom: isActive ? "2px solid #fff" : "2px solid transparent",
                    background: isActive ? "#fff" : "transparent",
                    cursor: "pointer",
                    marginBottom: "-2px",
                    whiteSpace: "nowrap",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    flexShrink: 0,
                  }}
                >
                  {tab}
                  <span style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    borderRadius: "4px",
                    padding: "1px 6px",
                    background: isActive ? "#1a1a1a" : "#e2e8f0",
                    color:      isActive ? "#fff"    : "#64748b",
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
        </div>

        {/* Rule list */}
        {activeRules.length === 0 ? (
          <div style={{
            padding: "32px",
            textAlign: "center",
            fontSize: "13px",
            color: "#94a3b8",
          }}>
            Ingen regler for {activeTab} endnu
          </div>
        ) : (
          activeRules.map((rule) => (
            <div
              key={rule.id}
              onMouseEnter={() => setHoveredRowId(rule.id)}
              onMouseLeave={() => setHoveredRowId(null)}
              style={{
                padding: "12px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid #dde3ed",
                background: hoveredRowId === rule.id ? "#f8fafc" : "#fff",
              }}
            >
              <span style={{ fontSize: "13px", color: "#1a1a1a" }}>
                {rule.publication_type}
              </span>
              <button
                type="button"
                onClick={() => void handleDelete(rule)}
                onMouseEnter={() => setHoveredFjernId(rule.id)}
                onMouseLeave={() => setHoveredFjernId(null)}
                disabled={busyDeleteId === rule.id}
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "4px 12px",
                  borderRadius: "6px",
                  border: `1px solid ${hoveredFjernId === rule.id ? "#F7C1C1" : "#cbd5e1"}`,
                  background: hoveredFjernId === rule.id ? "#FCEBEB" : "#e2e8f0",
                  color: hoveredFjernId === rule.id ? "#791F1F" : "#1a1a1a",
                  cursor: busyDeleteId === rule.id ? "not-allowed" : "pointer",
                  transition: "background 0.12s, border-color 0.12s, color 0.12s",
                  flexShrink: 0,
                }}
              >
                {busyDeleteId === rule.id ? "…" : "Fjern"}
              </button>
            </div>
          ))
        )}

        {/* Add row */}
        <div style={{
          padding: "12px 24px",
          borderTop: "1px solid #dde3ed",
          background: "#f8fafc",
          display: "flex",
          gap: "8px",
          alignItems: "center",
        }}>
          <select
            value={newPubType}
            onChange={(e) => setNewPubType(e.target.value)}
            style={{
              flex: 1,
              fontSize: "13px",
              color: newPubType ? "#1a1a1a" : "#94a3b8",
              border: "1px solid #dde3ed",
              borderRadius: "7px",
              padding: "7px 12px",
              outline: "none",
              background: "#fff",
              cursor: "pointer",
              fontFamily: "Inter, sans-serif",
            }}
          >
            <option value="">Vælg publication type…</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleAddRule()}
            disabled={busyAdd || !newPubType}
            style={{
              fontSize: "13px",
              fontWeight: 600,
              padding: "7px 18px",
              borderRadius: "7px",
              border: "none",
              background: busyAdd || !newPubType ? "#e2e8f0" : "#1a1a1a",
              color:      busyAdd || !newPubType ? "#94a3b8" : "#fff",
              cursor: busyAdd || !newPubType ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {busyAdd ? "Tilføjer…" : "Tilføj"}
          </button>
        </div>
      </div>}
    </div>
  );
}
