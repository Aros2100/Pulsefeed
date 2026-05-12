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

interface ReasonDetail {
  label: string;
  notes: string[];
}

interface PairData {
  pair:     { id: string; winnerId: string | null; sessionId: string | null };
  articleA: Article | null;
  articleB: Article | null;
  reasons:  ReasonDetail[];
}

interface Props {
  pairId:   string | null;
  onClose:  () => void;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function PairDetailModal({ pairId, onClose }: Props) {
  const [data, setData]       = useState<PairData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const overlayRef            = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pairId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    setLoading(true);
    setError(null);
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

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!pairId) return null;

  const winnerId  = data?.pair.winnerId ?? null;
  const articleA  = data?.articleA ?? null;
  const articleB  = data?.articleB ?? null;
  const reasons   = data?.reasons ?? [];
  const allLabels = reasons.map(r => r.label);

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
          padding: "16px 20px",
          borderBottom: "1px solid #f0f0f0",
          position: "sticky", top: 0, background: "#fff", zIndex: 1,
        }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a" }}>
            Pair detail
            {data?.pair.sessionId && (
              <span style={{ fontSize: "11px", fontWeight: 400, color: "#94a3b8", marginLeft: "10px" }}>
                session {data.pair.sessionId.slice(0, 8)}…
              </span>
            )}
          </div>
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

        {/* Body */}
        <div style={{ padding: "20px" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8", fontSize: "13px" }}>
              Loading…
            </div>
          )}
          {error && (
            <div style={{ textAlign: "center", padding: "24px 0", color: "#b91c1c", fontSize: "13px" }}>
              {error}
            </div>
          )}

          {data && !loading && (
            <>
              {/* Side-by-side article cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
                <ArticleCard article={articleA} isWinner={articleA?.id === winnerId} />
                <ArticleCard article={articleB} isWinner={articleB?.id === winnerId} />
              </div>

              {/* Reason categories + notes */}
              {allLabels.length > 0 && (
                <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: "16px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "12px" }}>
                    Reasons
                  </div>
                  {/* Category chips */}
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
                  {/* Notes per category */}
                  {reasons.filter(r => r.notes.length > 0).map(r => (
                    <div key={r.label} style={{ marginBottom: "12px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#374151", marginBottom: "4px" }}>
                        {r.label}
                      </div>
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
        </div>
      </div>
    </div>
  );
}

function ArticleCard({ article, isWinner }: { article: Article | null; isWinner: boolean }) {
  if (!article) {
    return (
      <div style={{ background: "#fafbfc", borderRadius: "8px", border: "1px solid #e5e7eb", padding: "14px 16px", color: "#94a3b8", fontSize: "13px" }}>
        (article not found)
      </div>
    );
  }
  const sari = article.sari ?? {};
  const border = isWinner ? "2px solid #059669" : "1px solid #e5e7eb";

  return (
    <div style={{ background: "#fff", borderRadius: "8px", border, padding: "14px 16px" }}>
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px", gap: "8px" }}>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          {isWinner && (
            <span style={{ fontSize: "10px", fontWeight: 700, color: "#fff", background: "#059669", padding: "2px 7px", borderRadius: "4px" }}>
              YOUR CHOICE
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

      {/* Title + meta */}
      <div style={{ fontSize: "13px", fontWeight: 600, lineHeight: 1.4, marginBottom: "4px" }}>{article.title}</div>
      <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "10px" }}>
        {[article.journal, fmtDate(article.published_date), article.article_type].filter(Boolean).join(" · ")}
        {article.pmid && <> · PMID {article.pmid}</>}
      </div>

      <Field label="Short headline" value={article.short_headline} />
      <Field label="Short resume"   value={article.resume}         divider />
      <Field label="Bottom line"    value={article.bottom_line}    divider />

      {/* SARI */}
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
