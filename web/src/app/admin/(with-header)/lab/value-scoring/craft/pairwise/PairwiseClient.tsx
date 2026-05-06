"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Category { id: string; label: string; }

interface Article {
  id: string;
  pmid: string | null;
  title: string;
  journal: string | null;
  article_type: string | null;
  published_date: string | null;
  short_headline: string | null;
  resume: string | null;
  bottom_line: string | null;
  sari: { subject?: string; action?: string; result?: string; implication?: string } | null;
}

interface NextResponse {
  ok: true;
  complete?: boolean;
  pairId?: string;
  sessionId?: string;
  sessionDecided?: number;
  sessionSize?: number;
  articleA?: Article;
  articleB?: Article;
}

interface Props {
  totalPairs:        number;
  decidedPairs:      number;
  sessionSize:       number;
  initialCategories: Category[];
}

const ACCENT = "#E83B2A";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function PairwiseClient({ totalPairs, decidedPairs: initialDecided, sessionSize, initialCategories }: Props) {
  const [decidedPairs, setDecidedPairs] = useState(initialDecided);
  const [categories,   setCategories]   = useState<Category[]>(initialCategories);
  const [pairId,       setPairId]       = useState<string | null>(null);
  const [sessionId,    setSessionId]    = useState<string | null>(null);
  const [sessionDecided, setSessionDecided] = useState<number>(0);
  const [articleA,     setArticleA]     = useState<Article | null>(null);
  const [articleB,     setArticleB]     = useState<Article | null>(null);
  const [complete,     setComplete]     = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  // Form state
  const [winnerId,    setWinnerId]    = useState<string | null>(null);
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [notes,       setNotes]       = useState("");
  const [submitting,  setSubmitting]  = useState(false);

  // New-category dialog
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState("");

  // Session list (decided pairs in current session, for editing)
  const [sessionPairs, setSessionPairs] = useState<{ pair_id: string; winner_id: string | null }[]>([]);
  const [editingPairId, setEditingPairId] = useState<string | null>(null);

  const loadNext = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWinnerId(null);
    setSelectedCats(new Set());
    setNotes("");
    setEditingPairId(null);
    try {
      const res = await fetch("/api/admin/lab/value-scoring/craft/pairwise/next");
      const json = (await res.json()) as NextResponse;
      if (!res.ok || !json.ok) {
        setError("error" in json && typeof (json as { error?: string }).error === "string" ? (json as { error: string }).error : "Failed to load next pair");
        return;
      }
      if (json.complete) {
        setComplete(true);
        setPairId(null);
        setArticleA(null);
        setArticleB(null);
        return;
      }
      setComplete(false);
      setPairId(json.pairId ?? null);
      setSessionId(json.sessionId ?? null);
      setSessionDecided(json.sessionDecided ?? 0);
      setArticleA(json.articleA ?? null);
      setArticleB(json.articleB ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load next pair");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadNext(); }, [loadNext]);

  // Load decided pairs for the current session (for the edit list)
  useEffect(() => {
    if (!sessionId) { setSessionPairs([]); return; }
    void (async () => {
      const res = await fetch(`/api/admin/lab/value-scoring/craft/pairwise/session?sessionId=${sessionId}`);
      if (!res.ok) return;
      const json = await res.json() as { ok: boolean; pairs?: { pair_id: string; winner_id: string | null }[] };
      if (json.ok && json.pairs) setSessionPairs(json.pairs);
    })();
  }, [sessionId, decidedPairs]);

  function toggleCat(catId: string) {
    setSelectedCats(prev => {
      const next = new Set(prev);
      next.has(catId) ? next.delete(catId) : next.add(catId);
      return next;
    });
  }

  async function submit() {
    if (!pairId || !winnerId || selectedCats.size === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const url = editingPairId
        ? "/api/admin/lab/value-scoring/craft/pairwise/edit"
        : "/api/admin/lab/value-scoring/craft/pairwise/submit";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pairId,
          winnerId,
          categoryIds: [...selectedCats],
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Submission failed");
        return;
      }
      if (!editingPairId) setDecidedPairs(d => d + 1);
      await loadNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function loadEdit(pid: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/lab/value-scoring/craft/pairwise/session?pairId=${pid}`);
      const json = await res.json() as {
        ok: boolean;
        pair?: {
          id: string; sessionId: string; winnerId: string | null;
          categoryIds: string[]; notes: string | null;
          articleA: Article; articleB: Article;
        };
      };
      if (!json.ok || !json.pair) { setError("Could not load pair"); return; }
      setPairId(json.pair.id);
      setSessionId(json.pair.sessionId);
      setArticleA(json.pair.articleA);
      setArticleB(json.pair.articleB);
      setWinnerId(json.pair.winnerId);
      setSelectedCats(new Set(json.pair.categoryIds));
      setNotes(json.pair.notes ?? "");
      setEditingPairId(pid);
      setComplete(false);
    } finally {
      setLoading(false);
    }
  }

  async function addCategory() {
    const label = newCatLabel.trim();
    if (!label) return;
    const res = await fetch("/api/admin/lab/value-scoring/craft/pairwise/category", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    const json = await res.json();
    if (!json.ok) { setError(json.error ?? "Could not add category"); return; }
    if (!categories.some(c => c.id === json.id)) {
      setCategories(cs => [...cs, { id: json.id, label: json.label }]);
    }
    setSelectedCats(prev => new Set([...prev, json.id]));
    setNewCatLabel("");
    setShowAddCat(false);
  }

  const sessionFull = sessionDecided >= sessionSize;
  const canSubmit = !!pairId && !!winnerId && selectedCats.size > 0 && !submitting;

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Heading */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: ACCENT, textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            The Lab · Value Scoring · Craft
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px" }}>Pairwise</h1>
          <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
            Compare two articles and choose which has higher craft quality.
          </p>
        </div>

        {/* Status bar */}
        <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "16px 24px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", gap: "32px", alignItems: "baseline" }}>
            <div>
              <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>Pairs completed</div>
              <div style={{ fontSize: "16px", fontWeight: 700 }}>{decidedPairs} / {totalPairs}</div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>Current session</div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: sessionFull ? "#059669" : "#1a1a1a" }}>
                {sessionDecided} / {sessionSize}
              </div>
            </div>
          </div>
          <Link href="/admin/lab/value-scoring/craft/ranking" style={{ fontSize: "13px", color: ACCENT, textDecoration: "none" }}>
            View ranking →
          </Link>
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px 16px", marginBottom: "20px", fontSize: "13px", color: "#b91c1c" }}>
            {error}
          </div>
        )}

        {/* Body */}
        {complete && (
          <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "32px", textAlign: "center" }}>
            <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>All pairs completed</div>
            <p style={{ fontSize: "13px", color: "#888", marginBottom: "16px" }}>
              Every pair in the current batch has a winner.
            </p>
            <Link href="/admin/lab/value-scoring/craft/ranking" style={{ display: "inline-block", padding: "8px 18px", background: ACCENT, color: "#fff", borderRadius: "8px", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}>
              View ranking →
            </Link>
          </div>
        )}

        {sessionFull && !complete && !editingPairId && (
          <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "32px", textAlign: "center", marginBottom: "20px" }}>
            <div style={{ fontSize: "16px", fontWeight: 600, color: "#059669", marginBottom: "8px" }}>Session complete ({sessionDecided}/{sessionSize})</div>
            <p style={{ fontSize: "13px", color: "#888", marginBottom: "16px" }}>Start a new session or review the ranking.</p>
            <div style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
              <button
                onClick={loadNext}
                style={{ padding: "8px 18px", background: ACCENT, color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              >
                Start new session →
              </button>
              <Link href="/admin/lab/value-scoring/craft/ranking" style={{ padding: "8px 18px", background: "#fff", color: "#5a6a85", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}>
                View ranking →
              </Link>
            </div>
          </div>
        )}

        {!complete && !sessionFull && articleA && articleB && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
            <ArticlePane
              article={articleA}
              side="A"
              chosen={winnerId === articleA.id}
              onChoose={() => setWinnerId(articleA.id)}
              loading={loading}
            />
            <ArticlePane
              article={articleB}
              side="B"
              chosen={winnerId === articleB.id}
              onChoose={() => setWinnerId(articleB.id)}
              loading={loading}
            />
          </div>
        )}

        {/* Reasons + submit */}
        {!complete && !sessionFull && articleA && articleB && (
          <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "20px 24px", marginBottom: "20px" }}>
            <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: "12px" }}>
              Reason categories <span style={{ color: "#94a3b8", fontWeight: 400 }}>(at least one required)</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
              {categories.map(cat => {
                const on = selectedCats.has(cat.id);
                return (
                  <button
                    key={cat.id}
                    onClick={() => toggleCat(cat.id)}
                    style={{
                      fontSize: "12px",
                      fontFamily: "inherit",
                      padding: "6px 12px",
                      borderRadius: "999px",
                      border: on ? `1.5px solid ${ACCENT}` : "1px solid #e5e7eb",
                      background: on ? "#fef2f2" : "#fff",
                      color: on ? ACCENT : "#5a6a85",
                      fontWeight: on ? 600 : 500,
                      cursor: "pointer",
                    }}
                  >
                    {cat.label}
                  </button>
                );
              })}
              <button
                onClick={() => setShowAddCat(s => !s)}
                style={{ fontSize: "12px", fontFamily: "inherit", padding: "6px 12px", borderRadius: "999px", border: "1px dashed #cbd5e1", background: "#fff", color: "#94a3b8", cursor: "pointer" }}
              >
                + Add category
              </button>
            </div>

            {showAddCat && (
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                <input
                  type="text"
                  value={newCatLabel}
                  onChange={e => setNewCatLabel(e.target.value)}
                  placeholder="New category label"
                  style={{ flex: 1, fontSize: "13px", padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: "6px", fontFamily: "inherit" }}
                />
                <button
                  onClick={addCategory}
                  style={{ fontSize: "12px", fontWeight: 600, padding: "7px 14px", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}
                >
                  Add
                </button>
                <button
                  onClick={() => { setShowAddCat(false); setNewCatLabel(""); }}
                  style={{ fontSize: "12px", padding: "7px 14px", background: "#fff", color: "#5a6a85", border: "1px solid #e5e7eb", borderRadius: "6px", cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            )}

            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: "6px" }}>
                Notes <span style={{ color: "#94a3b8", fontWeight: 400 }}>(optional)</span>
              </div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional free-text reasoning…"
                rows={2}
                style={{ width: "100%", fontSize: "13px", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              {editingPairId && (
                <button
                  onClick={loadNext}
                  style={{ fontSize: "13px", padding: "8px 16px", background: "#fff", color: "#5a6a85", border: "1px solid #e5e7eb", borderRadius: "8px", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Cancel edit
                </button>
              )}
              <button
                onClick={submit}
                disabled={!canSubmit}
                style={{
                  fontSize: "13px", fontWeight: 600, fontFamily: "inherit",
                  padding: "8px 18px",
                  background: canSubmit ? ACCENT : "#f0f2f5",
                  color: canSubmit ? "#fff" : "#94a3b8",
                  border: "none", borderRadius: "8px",
                  cursor: canSubmit ? "pointer" : "default",
                }}
              >
                {submitting ? "Submitting…" : editingPairId ? "Save changes" : "Submit and next →"}
              </button>
            </div>
          </div>
        )}

        {/* Completed-this-session list (editable) */}
        {sessionPairs.length > 0 && (
          <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", overflow: "hidden", marginBottom: "20px" }}>
            <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
              <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
                Completed this session ({sessionPairs.length}/{sessionSize})
              </span>
            </div>
            <div>
              {sessionPairs.map((p, i) => (
                <div key={p.pair_id} style={{ padding: "10px 24px", borderTop: i === 0 ? "none" : "1px solid #f5f5f5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12px", color: "#5a6a85" }}>Pair {i + 1}</span>
                  <button
                    onClick={() => loadEdit(p.pair_id)}
                    disabled={editingPairId === p.pair_id}
                    style={{
                      fontSize: "11px", fontFamily: "inherit",
                      background: "#f5f7fa", color: "#5a6a85",
                      border: "1px solid #e5e7eb", borderRadius: "6px", padding: "4px 10px",
                      cursor: editingPairId === p.pair_id ? "default" : "pointer",
                    }}
                  >
                    {editingPairId === p.pair_id ? "Editing…" : "Edit"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: "16px" }}>
          <Link href="/admin/lab/value-scoring/craft" style={{ fontSize: "12px", color: "#94a3b8", textDecoration: "none" }}>
            ← Back to module
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Article pane ─────────────────────────────────────────────────────────────

function ArticlePane({ article, side, chosen, onChoose, loading }: {
  article: Article; side: "A" | "B"; chosen: boolean; onChoose: () => void; loading: boolean;
}) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: "10px",
      boxShadow: chosen
        ? "0 0 0 2px #E83B2A"
        : "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
      overflow: "hidden",
      opacity: loading ? 0.6 : 1,
    }}>
      <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
          Article {side}
        </span>
        <button
          onClick={onChoose}
          disabled={loading}
          style={{
            fontSize: "12px", fontWeight: 600, fontFamily: "inherit",
            padding: "5px 14px",
            background: chosen ? ACCENT : "#fff",
            color: chosen ? "#fff" : "#1a1a1a",
            border: chosen ? "none" : "1px solid #e5e7eb",
            borderRadius: "6px",
            cursor: loading ? "default" : "pointer",
          }}
        >
          {chosen ? "✓ Chosen" : `Choose ${side}`}
        </button>
      </div>

      <div style={{ padding: "20px 24px" }}>
        <div style={{ fontSize: "14px", fontWeight: 600, lineHeight: 1.4, marginBottom: "6px" }}>
          {article.title}
        </div>
        <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "16px" }}>
          {[article.journal, fmtDate(article.published_date), article.article_type].filter(Boolean).join(" · ")}
          {article.pmid && <> · <a href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`} target="_blank" rel="noopener noreferrer" style={{ color: "#94a3b8" }}>PMID {article.pmid}</a></>}
        </div>

        <FieldRow label="Short headline" value={article.short_headline} />
        <FieldRow label="Short resume"   value={article.resume}         divider />
        <FieldRow label="Bottom line"    value={article.bottom_line}    divider />

        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "0 12px", borderTop: "1px solid #ebebeb", paddingTop: "14px", marginTop: "14px", alignItems: "start" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#5a6a85", paddingTop: "2px" }}>SARI</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", background: "#fafafa", borderRadius: "6px", padding: "12px" }}>
            <SariCell label="Subject"     value={article.sari?.subject     ?? null} />
            <SariCell label="Action"      value={article.sari?.action      ?? null} />
            <SariCell label="Result"      value={article.sari?.result      ?? null} />
            <SariCell label="Implication" value={article.sari?.implication ?? null} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, value, divider }: { label: string; value: string | null; divider?: boolean }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "120px 1fr", gap: "0 12px",
      alignItems: "start",
      borderTop: divider ? "1px solid #ebebeb" : "none",
      paddingTop: divider ? "12px" : 0,
      marginTop: divider ? "12px" : 0,
    }}>
      <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#5a6a85", paddingTop: "2px" }}>
        {label}
      </div>
      <div style={{ fontSize: "13px", color: value ? "#1a1a1a" : "#bbb", lineHeight: 1.55 }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

function SariCell({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "3px" }}>
        {label}
      </div>
      <div style={{ fontSize: "12px", color: value ? "#374151" : "#bbb", lineHeight: 1.5 }}>
        {value ?? "—"}
      </div>
    </div>
  );
}
