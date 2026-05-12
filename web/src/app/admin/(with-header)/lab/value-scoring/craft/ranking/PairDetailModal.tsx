"use client";

import { useEffect, useRef, useState } from "react";

interface Article {
  id:             string;
  title:          string;
  journal:        string | null;
  article_type:   string | null;
  published_date: string | null;
  pmid:           string | null;
  short_headline: string | null;
  resume:         string | null;
  bottom_line:    string | null;
  sari: {
    subject?:     string | null;
    action?:      string | null;
    result?:      string | null;
    implication?: string | null;
  } | null;
  normalizedScore: number | null;
}

interface ReasonDetail  { label: string; notes: string[]; }
interface CategoryOption { id: string; label: string; }

interface PairData {
  pair:                { id: string; winnerId: string | null; sessionId: string | null };
  articleA:            Article | null;
  articleB:            Article | null;
  reasons:             ReasonDetail[];
  selectedCategoryIds: string[];
  pairNotes:           string | null;
  allCategories:       CategoryOption[];
}

interface Props {
  pairId:  string | null;
  onClose: () => void;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function PairDetailModal({ pairId, onClose }: Props) {
  const [data,    setData]    = useState<PairData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Edit state
  const [editMode,     setEditMode]     = useState(false);
  const [pendingWinner, setPendingWinner] = useState<string | null>(null);
  const [pendingCats,   setPendingCats]   = useState<Set<string>>(new Set());
  const [pendingNotes,  setPendingNotes]  = useState("");
  const [saving,        setSaving]        = useState(false);
  const [saveError,     setSaveError]     = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pairId) return;
    setData(null);
    setLoading(true);
    setError(null);
    setEditMode(false);
    let cancelled = false;
    fetch(`/api/admin/lab/value-scoring/craft/ranking/pair-detail?pairId=${pairId}`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        if (!json.ok) setError(json.error ?? "Failed to load pair");
        else setData(json as PairData & { ok: true });
      })
      .catch(() => { if (!cancelled) setError("Failed to load pair"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pairId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function enterEdit() {
    if (!data) return;
    setPendingWinner(data.pair.winnerId);
    setPendingCats(new Set(data.selectedCategoryIds));
    setPendingNotes(data.pairNotes ?? "");
    setSaveError(null);
    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
    setSaveError(null);
  }

  async function saveEdit() {
    if (!data || !pendingWinner) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/admin/lab/value-scoring/craft/pair/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pairId:      data.pair.id,
          winnerId:    pendingWinner,
          categoryIds: [...pendingCats],
          notes:       pendingNotes,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setSaveError(json.error ?? "Save failed");
        return;
      }
      // Re-fetch fresh data and exit edit mode
      setEditMode(false);
      setLoading(true);
      setData(null);
      const fresh = await fetch(`/api/admin/lab/value-scoring/craft/ranking/pair-detail?pairId=${data.pair.id}`);
      const freshJson = await fresh.json();
      if (freshJson.ok) setData(freshJson as PairData & { ok: true });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
      setLoading(false);
    }
  }

  if (!pairId) return null;

  const winnerId      = editMode ? pendingWinner : data?.pair.winnerId ?? null;
  const articleA      = data?.articleA ?? null;
  const articleB      = data?.articleB ?? null;
  const reasons       = data?.reasons ?? [];
  const allCategories = data?.allCategories ?? [];
  const allLabels     = reasons.map(r => r.label);

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px",
      }}
    >
      <div style={{
        background: "#fff", borderRadius: "12px",
        width: "100%", maxWidth: "900px",
        maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 20px", borderBottom: "1px solid #f0f0f0",
          position: "sticky", top: 0, background: "#fff", zIndex: 1,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a" }}>
              Pair detail
            </div>
            {editMode && (
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#E83B2A", background: "#fff4f3", border: "1px solid #fca99e", borderRadius: "4px", padding: "2px 8px" }}>
                EDIT MODE
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {!editMode && data && (
              <button
                onClick={enterEdit}
                style={{
                  background: "#fff", color: "#1a1a1a",
                  border: "1px solid #e5e7eb", borderRadius: "6px",
                  padding: "5px 12px", fontSize: "12px", fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Edit
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none",
                cursor: "pointer", fontSize: "18px",
                color: "#94a3b8", lineHeight: 1, padding: "4px 8px",
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8", fontSize: "13px" }}>Loading…</div>
          )}
          {error && (
            <div style={{ textAlign: "center", padding: "24px 0", color: "#b91c1c", fontSize: "13px" }}>{error}</div>
          )}

          {data && !loading && (
            <>
              {/* Side-by-side article cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
                <ArticleCard
                  article={articleA}
                  isWinner={articleA?.id === winnerId}
                  editMode={editMode}
                  onClick={editMode && articleA ? () => setPendingWinner(articleA.id) : undefined}
                />
                <ArticleCard
                  article={articleB}
                  isWinner={articleB?.id === winnerId}
                  editMode={editMode}
                  onClick={editMode && articleB ? () => setPendingWinner(articleB.id) : undefined}
                />
              </div>

              {/* Reasons section */}
              {editMode ? (
                <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: "16px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "12px" }}>
                    Reasons
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
                    {allCategories.map(cat => {
                      const active = pendingCats.has(cat.id);
                      return (
                        <button
                          key={cat.id}
                          onClick={() => setPendingCats(prev => {
                            const next = new Set(prev);
                            if (next.has(cat.id)) next.delete(cat.id);
                            else next.add(cat.id);
                            return next;
                          })}
                          style={{
                            fontSize: "11px", fontWeight: 600,
                            background: active ? "#E83B2A" : "#f3f4f6",
                            color: active ? "#fff" : "#374151",
                            borderRadius: "5px", padding: "5px 12px",
                            border: "none", cursor: "pointer",
                          }}
                        >
                          {cat.label}
                        </button>
                      );
                    })}
                  </div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "6px" }}>
                    Notes
                  </label>
                  <textarea
                    value={pendingNotes}
                    onChange={e => setPendingNotes(e.target.value)}
                    placeholder="Optional free-text note about the decision…"
                    style={{
                      width: "100%", minHeight: "80px", padding: "10px",
                      fontSize: "13px", border: "1px solid #e5e7eb", borderRadius: "6px",
                      resize: "vertical", color: "#1a1a1a", background: "#fff",
                    }}
                  />
                  {saveError && (
                    <div style={{ marginTop: "10px", fontSize: "12px", color: "#b91c1c" }}>{saveError}</div>
                  )}
                  <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                    <button
                      onClick={cancelEdit}
                      disabled={saving}
                      style={{
                        background: "#fff", color: "#1a1a1a",
                        border: "1px solid #e5e7eb", borderRadius: "6px",
                        padding: "9px 16px", fontSize: "13px", fontWeight: 600,
                        cursor: saving ? "default" : "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={saving || !pendingWinner}
                      style={{
                        background: saving || !pendingWinner ? "#fda99e" : "#E83B2A",
                        color: "#fff", border: "none", borderRadius: "6px",
                        padding: "9px 18px", fontSize: "13px", fontWeight: 600,
                        cursor: saving || !pendingWinner ? "default" : "pointer",
                      }}
                    >
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {allLabels.length > 0 && (
                    <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: "16px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "12px" }}>
                        Reasons
                      </div>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
                        {allLabels.map(label => (
                          <span key={label} style={{
                            fontSize: "11px", fontWeight: 600,
                            background: "#E83B2A", color: "#fff",
                            borderRadius: "5px", padding: "3px 10px",
                          }}>
                            {label}
                          </span>
                        ))}
                      </div>
                      {reasons.filter(r => r.notes.length > 0).map(r => (
                        <div key={r.label} style={{ marginBottom: "12px" }}>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#374151", marginBottom: "4px" }}>{r.label}</div>
                          {r.notes.map((note, i) => (
                            <div key={i} style={{
                              fontSize: "12px", color: "#5a6a85", lineHeight: 1.55,
                              padding: "6px 10px", background: "#fafbfc",
                              borderRadius: "6px", borderLeft: "2px solid #e5e7eb",
                              marginBottom: "4px",
                            }}>
                              {note}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  {allLabels.length === 0 && (
                    <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: "16px", fontSize: "12px", color: "#94a3b8" }}>
                      No reason categories recorded for this pair.
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ArticleCard({ article, isWinner, editMode, onClick }: {
  article: Article | null;
  isWinner: boolean;
  editMode: boolean;
  onClick?: () => void;
}) {
  if (!article) {
    return (
      <div style={{ background: "#fafbfc", borderRadius: "8px", border: "1px solid #e5e7eb", padding: "14px 16px", color: "#94a3b8", fontSize: "13px" }}>
        (article not found)
      </div>
    );
  }
  const sari = article.sari ?? {};
  const border = editMode
    ? isWinner ? "2px solid #059669" : "1px solid #e5e7eb"
    : isWinner ? "2px solid #059669" : "1px solid #e5e7eb";

  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff", borderRadius: "8px", border, padding: "14px 16px",
        cursor: editMode ? "pointer" : "default",
        transition: "border-color 0.1s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px", gap: "8px" }}>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          {isWinner && (
            <span style={{ fontSize: "10px", fontWeight: 700, color: "#fff", background: "#059669", padding: "2px 7px", borderRadius: "4px" }}>
              {editMode ? "SELECTED" : "YOUR CHOICE"}
            </span>
          )}
          {article.normalizedScore !== null && (
            <span style={{
              fontSize: "11px", fontWeight: 600, padding: "2px 7px", borderRadius: "4px",
              background: article.normalizedScore >= 7.5 ? "#f0fdf4" : article.normalizedScore >= 3.5 ? "#f9fafb" : "#fef2f2",
              color:      article.normalizedScore >= 7.5 ? "#059669" : article.normalizedScore >= 3.5 ? "#374151" : "#b91c1c",
            }}>
              BT {article.normalizedScore.toFixed(1)}
            </span>
          )}
        </div>
      </div>
      <div style={{ fontSize: "13px", fontWeight: 600, lineHeight: 1.4, marginBottom: "4px" }}>{article.title}</div>
      <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "10px" }}>
        {[article.journal, fmtDate(article.published_date), article.article_type].filter(Boolean).join(" · ")}
        {article.pmid && <> · PMID {article.pmid}</>}
      </div>
      <Field label="Short headline" value={article.short_headline} />
      <Field label="Short resume"   value={article.resume}         divider />
      <Field label="Bottom line"    value={article.bottom_line}    divider />
      <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: "10px", marginTop: "10px" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "6px" }}>SARI</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", background: "#fafbfc", borderRadius: "6px", padding: "10px" }}>
          <SariCell label="Subject"     value={sari.subject     ?? null} />
          <SariCell label="Action"      value={sari.action      ?? null} />
          <SariCell label="Result"      value={sari.result      ?? null} />
          <SariCell label="Implication" value={sari.implication ?? null} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, divider }: { label: string; value: string | null; divider?: boolean }) {
  return (
    <div style={{ borderTop: divider ? "1px solid #f0f0f0" : "none", paddingTop: divider ? "8px" : 0, marginTop: divider ? "8px" : 0 }}>
      <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "12px", color: value ? "#1a1a1a" : "#bbb", lineHeight: 1.5 }}>{value ?? "—"}</div>
    </div>
  );
}

function SariCell({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "11px", color: value ? "#374151" : "#bbb", lineHeight: 1.4 }}>{value ?? "—"}</div>
    </div>
  );
}
