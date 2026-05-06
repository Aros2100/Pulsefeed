"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Category { id: string; label: string; }

interface Article {
  id: string; pmid: string | null; title: string; journal: string | null;
  article_type: string | null; published_date: string | null;
  short_headline: string | null; resume: string | null; bottom_line: string | null;
  sari: { subject?: string; action?: string; result?: string; implication?: string } | null;
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

export default function PairwiseClient({
  totalPairs, decidedPairs: initialDecided, sessionSize, initialCategories,
}: Props) {
  const [categories,    setCategories]    = useState<Category[]>(initialCategories);
  const [decidedTotal,  setDecidedTotal]  = useState(initialDecided);

  // Current pair
  const [pairId,        setPairId]        = useState<string | null>(null);
  const [sessionId,     setSessionId]     = useState<string | null>(null);
  const [articleA,      setArticleA]      = useState<Article | null>(null);
  const [articleB,      setArticleB]      = useState<Article | null>(null);
  const [isDecided,     setIsDecided]     = useState(false); // current pair already has winner
  const [complete,      setComplete]      = useState(false);
  const [sessionFull,   setSessionFull]   = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);

  // Session navigation — ordered list of pair IDs assigned to the current session
  const [sessionPairIds,   setSessionPairIds]   = useState<string[]>([]);
  const [sessionDecidedSet, setSessionDecidedSet] = useState<Set<string>>(new Set());
  const [currentIdx,       setCurrentIdx]       = useState(-1);

  // Form
  const [winnerId,    setWinnerId]    = useState<string | null>(null);
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [notes,       setNotes]       = useState("");
  const [showAddCat,  setShowAddCat]  = useState(false);
  const [newCatLabel, setNewCatLabel] = useState("");
  const [saveStatus,  setSaveStatus]  = useState<"idle" | "saving" | "saved">("idle");

  // Autosave refs
  const isDecidedRef  = useRef(false);
  const lastSavedRef  = useRef<string | null>(null); // prevents double-save of same state

  // Keep ref in sync so autosave closure sees fresh value
  isDecidedRef.current = isDecided;

  // ── Form clear ─────────────────────────────────────────────────────────────
  function clearForm() {
    setWinnerId(null);
    setSelectedCats(new Set());
    setNotes("");
    setSaveStatus("idle");
    lastSavedRef.current = null;
  }

  // ── Load next undecided pair ───────────────────────────────────────────────
  const loadNext = useCallback(async () => {
    setLoading(true);
    setError(null);
    clearForm();
    try {
      const res  = await fetch("/api/admin/lab/value-scoring/craft/pairwise/next");
      const json = await res.json() as {
        ok: boolean; complete?: boolean;
        pairId?: string; sessionId?: string;
        sessionDecided?: number; sessionSize?: number;
        articleA?: Article; articleB?: Article;
        error?: string;
      };
      if (!res.ok || !json.ok) { setError(json.error ?? "Failed to load next pair"); return; }
      if (json.complete) { setComplete(true); return; }

      const newPairId   = json.pairId!;
      const newSessionId = json.sessionId!;
      const decided     = json.sessionDecided ?? 0;

      setComplete(false);
      setSessionFull(decided >= sessionSize);
      setPairId(newPairId);
      setSessionId(newSessionId);
      setArticleA(json.articleA ?? null);
      setArticleB(json.articleB ?? null);
      setIsDecided(false);

      // Build / refresh session navigation list
      const sessRes  = await fetch(`/api/admin/lab/value-scoring/craft/pairwise/session?sessionId=${newSessionId}`);
      const sessJson = await sessRes.json() as { ok: boolean; pairs?: { pair_id: string; winner_id: string | null }[] };
      if (sessJson.ok && sessJson.pairs) {
        const decided_ids = sessJson.pairs.map(p => p.pair_id);
        const all = [...decided_ids];
        if (!all.includes(newPairId)) all.push(newPairId);
        setSessionPairIds(all);
        setSessionDecidedSet(new Set(decided_ids));
        setCurrentIdx(all.length - 1);
      } else {
        setSessionPairIds([newPairId]);
        setSessionDecidedSet(new Set());
        setCurrentIdx(0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [sessionSize]);

  useEffect(() => { void loadNext(); }, [loadNext]);

  // ── Load a specific pair (for navigation) ─────────────────────────────────
  async function loadPairById(pid: string, idx: number) {
    setLoading(true);
    setError(null);
    clearForm();
    try {
      const res  = await fetch(`/api/admin/lab/value-scoring/craft/pairwise/session?pairId=${pid}`);
      const json = await res.json() as {
        ok: boolean; error?: string;
        pair?: {
          id: string; sessionId: string; winnerId: string | null;
          categoryIds: string[]; notes: string | null;
          articleA: Article; articleB: Article;
        };
      };
      if (!json.ok || !json.pair) { setError(json.error ?? "Could not load pair"); return; }
      const p = json.pair;
      setPairId(p.id);
      setSessionId(p.sessionId);
      setArticleA(p.articleA);
      setArticleB(p.articleB);
      setIsDecided(p.winnerId !== null);
      if (p.winnerId) setWinnerId(p.winnerId);
      setSelectedCats(new Set(p.categoryIds));
      setNotes(p.notes ?? "");
      setCurrentIdx(idx);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pair");
    } finally {
      setLoading(false);
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  async function goToPrevious() {
    if (currentIdx <= 0) return;
    await loadPairById(sessionPairIds[currentIdx - 1], currentIdx - 1);
  }

  async function goToNext() {
    if (currentIdx < sessionPairIds.length - 1) {
      await loadPairById(sessionPairIds[currentIdx + 1], currentIdx + 1);
    } else {
      // At end of known session pairs — advance to next undecided
      await loadNext();
    }
  }

  const canPrev = currentIdx > 0 && !loading;
  const canNext = !loading;

  // ── Autosave — fires when winner + at least one category are set ───────────
  const selectedCatsKey = [...selectedCats].sort().join(",");

  useEffect(() => {
    if (!pairId || !winnerId || selectedCats.size === 0) return;
    const stateKey = `${pairId}|${winnerId}|${selectedCatsKey}|${notes}`;
    if (lastSavedRef.current === stateKey) return; // already saved this exact state

    setSaveStatus("saving");
    const timer = setTimeout(async () => {
      try {
        const url = isDecidedRef.current
          ? "/api/admin/lab/value-scoring/craft/pairwise/edit"
          : "/api/admin/lab/value-scoring/craft/pairwise/submit";
        const res  = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pairId, winnerId, categoryIds: [...selectedCats], notes: notes.trim() || undefined }),
        });
        const json = await res.json();
        if (!json.ok) { setSaveStatus("idle"); return; }

        lastSavedRef.current = stateKey;
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus(s => s === "saved" ? "idle" : s), 1500);

        if (!isDecidedRef.current) {
          setIsDecided(true);
          setDecidedTotal(d => d + 1);
          setSessionDecidedSet(prev => {
            const next = new Set([...prev, pairId]);
            if (next.size >= sessionSize) setSessionFull(true);
            return next;
          });
        }
      } catch {
        setSaveStatus("idle");
      }
    }, 450);

    return () => { clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairId, winnerId, selectedCatsKey, notes]);

  // ── Add category ───────────────────────────────────────────────────────────
  async function addCategory() {
    const label = newCatLabel.trim();
    if (!label) return;
    const res  = await fetch("/api/admin/lab/value-scoring/craft/pairwise/category", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    const json = await res.json();
    if (!json.ok) { setError(json.error ?? "Could not add category"); return; }
    if (!categories.some(c => c.id === json.id)) {
      setCategories(cs => [...cs, { id: json.id, label: json.label }]);
    }
    setSelectedCats(prev => new Set([...prev, json.id as string]));
    setNewCatLabel("");
    setShowAddCat(false);
  }

  const pairPositionInSession = currentIdx + 1; // 1-based

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <style>{`.article-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.10) !important; }`}</style>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 0 80px" }}>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px 16px", marginBottom: "20px", fontSize: "13px", color: "#b91c1c" }}>
            {error}
          </div>
        )}

        {/* All pairs complete */}
        {complete && (
          <div style={{ padding: "24px", textAlign: "center" }}>
            <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "32px", display: "inline-block" }}>
              <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>All pairs completed</div>
              <p style={{ fontSize: "13px", color: "#888", marginBottom: "16px" }}>
                Every pair in the current batch has a winner.
              </p>
              <Link href="/admin/lab/value-scoring/craft/ranking" style={{ display: "inline-block", padding: "8px 18px", background: ACCENT, color: "#fff", borderRadius: "8px", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}>
                View ranking →
              </Link>
            </div>
          </div>
        )}

        {/* Session complete */}
        {sessionFull && !complete && (
          <div style={{ padding: "24px" }}>
          <div style={{ background: "#fff", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)", padding: "32px", textAlign: "center" }}>
            <div style={{ fontSize: "16px", fontWeight: 600, color: "#059669", marginBottom: "8px" }}>
              Session complete ({sessionSize}/{sessionSize})
            </div>
            <p style={{ fontSize: "13px", color: "#888", marginBottom: "16px" }}>Take a break, or continue with a new session.</p>
            <div style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
              <button
                onClick={() => { setSessionFull(false); setSessionPairIds([]); void loadNext(); }}
                style={{ padding: "8px 18px", background: ACCENT, color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              >
                Start new session →
              </button>
              <Link href="/admin/lab/value-scoring/craft/ranking" style={{ padding: "8px 18px", background: "#fff", color: "#5a6a85", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}>
                View ranking →
              </Link>
            </div>
          </div>
          </div>
        )}

        {/* Work area */}
        {!complete && !sessionFull && articleA && articleB && (
          <>
            {/* Two article cards — clickable, full container width */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
              <ArticleCard article={articleA} chosen={winnerId === articleA.id} onChoose={() => setWinnerId(articleA.id)} loading={loading} />
              <ArticleCard article={articleB} chosen={winnerId === articleB.id} onChoose={() => setWinnerId(articleB.id)} loading={loading} />
            </div>

            {/* Input + navigation — distinct background */}
            <div style={{ background: "#eef0f4", padding: "14px 24px 20px" }}>

              {/* Session status + save indicator */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                  Pair {pairPositionInSession} of {sessionSize} in current session
                </span>
                {saveStatus === "saving" && <span style={{ fontSize: "11px", color: "#94a3b8" }}>Saving…</span>}
                {saveStatus === "saved"  && <span style={{ fontSize: "11px", color: "#059669" }}>Saved</span>}
              </div>

              {/* Categories */}
              <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: "10px" }}>
                Reason categories <span style={{ color: "#94a3b8", fontWeight: 400 }}>(at least one required)</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "14px" }}>
                {categories.map(cat => {
                  const on = selectedCats.has(cat.id);
                  return (
                    <button key={cat.id} onClick={() => setSelectedCats(prev => { const n = new Set(prev); n.has(cat.id) ? n.delete(cat.id) : n.add(cat.id); return n; })} style={{ fontSize: "12px", fontFamily: "inherit", padding: "6px 12px", borderRadius: "999px", border: on ? `1.5px solid ${ACCENT}` : "1px solid #e5e7eb", background: on ? "#fef2f2" : "#fff", color: on ? ACCENT : "#5a6a85", fontWeight: on ? 600 : 500, cursor: "pointer" }}>
                      {cat.label}
                    </button>
                  );
                })}
                <button onClick={() => setShowAddCat(s => !s)} style={{ fontSize: "12px", fontFamily: "inherit", padding: "6px 12px", borderRadius: "999px", border: "1px dashed #cbd5e1", background: "#fff", color: "#94a3b8", cursor: "pointer" }}>
                  + Add category
                </button>
              </div>

              {showAddCat && (
                <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                  <input type="text" value={newCatLabel} onChange={e => setNewCatLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && void addCategory()} placeholder="New category label" style={{ flex: 1, fontSize: "13px", padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: "6px", fontFamily: "inherit" }} />
                  <button onClick={addCategory} style={{ fontSize: "12px", fontWeight: 600, padding: "7px 14px", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}>Add</button>
                  <button onClick={() => { setShowAddCat(false); setNewCatLabel(""); }} style={{ fontSize: "12px", padding: "7px 14px", background: "#fff", color: "#5a6a85", border: "1px solid #e5e7eb", borderRadius: "6px", cursor: "pointer" }}>Cancel</button>
                </div>
              )}

              {/* Notes */}
              <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: "6px" }}>
                Notes <span style={{ color: "#94a3b8", fontWeight: 400 }}>(optional)</span>
              </div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional free-text reasoning…" rows={2} style={{ width: "100%", fontSize: "13px", padding: "10px 12px", border: "1px solid #dde3ed", borderRadius: "8px", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: "12px" }} />

              {/* Navigation row: ← Previous | Next → */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button
                  onClick={goToPrevious}
                  disabled={!canPrev}
                  style={{ fontSize: "13px", fontFamily: "inherit", padding: "8px 16px", background: "#fff", color: canPrev ? "#5a6a85" : "#d1d5db", border: "1px solid", borderColor: canPrev ? "#dde3ed" : "#f0f0f0", borderRadius: "8px", cursor: canPrev ? "pointer" : "default" }}
                >
                  ← Previous
                </button>
                <button
                  onClick={goToNext}
                  disabled={!canNext}
                  style={{ fontSize: "13px", fontFamily: "inherit", padding: "8px 16px", background: "#fff", color: canNext ? "#5a6a85" : "#d1d5db", border: "1px solid", borderColor: canNext ? "#dde3ed" : "#f0f0f0", borderRadius: "8px", cursor: canNext ? "pointer" : "default" }}
                >
                  Next →
                </button>
              </div>

            </div>
          </>
        )}

        <div style={{ marginTop: "16px", padding: "0 24px" }}>
          <Link href="/admin/lab/value-scoring/craft" style={{ fontSize: "12px", color: "#94a3b8", textDecoration: "none" }}>
            ← Back to module
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Article card — clickable, no header ──────────────────────────────────────

function ArticleCard({ article, chosen, onChoose, loading }: {
  article: Article; chosen: boolean; onChoose: () => void; loading: boolean;
}) {
  return (
    <div
      className="article-card"
      onClick={loading ? undefined : onChoose}
      style={{
        background: chosen ? "#f0fdf4" : "#fff",
        borderRadius: "10px",
        border: chosen ? "2px solid #059669" : "1px solid #e5e7eb",
        boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
        overflow: "hidden",
        opacity: loading ? 0.6 : 1,
        cursor: loading ? "default" : "pointer",
        transition: "border-color 0.1s, background 0.1s",
      }}
    >
      <div style={{ padding: "20px 24px" }}>
        <div style={{ fontSize: "14px", fontWeight: 600, lineHeight: 1.4, marginBottom: "6px" }}>{article.title}</div>
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
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "0 12px", alignItems: "start", borderTop: divider ? "1px solid #ebebeb" : "none", paddingTop: divider ? "12px" : 0, marginTop: divider ? "12px" : 0 }}>
      <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#5a6a85", paddingTop: "2px" }}>{label}</div>
      <div style={{ fontSize: "13px", color: value ? "#1a1a1a" : "#bbb", lineHeight: 1.55 }}>{value ?? "—"}</div>
    </div>
  );
}

function SariCell({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#94a3b8", marginBottom: "3px" }}>{label}</div>
      <div style={{ fontSize: "12px", color: value ? "#374151" : "#bbb", lineHeight: 1.5 }}>{value ?? "—"}</div>
    </div>
  );
}
