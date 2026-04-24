"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CondensationArticle {
  id: string;
  title: string;
  journal_abbr: string | null;
  journal_title: string | null;
  published_date: string | null;
  abstract: string | null;
  pubmed_id: string | null;
  authors: unknown;
  short_headline: string | null;
  short_resume: string | null;
  bottom_line: string | null;
  text_model_version: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function firstAuthor(authors: unknown): string {
  if (!Array.isArray(authors) || authors.length === 0) return "";
  const a = authors[0] as { foreName?: string; lastName?: string };
  const name = [a.foreName, a.lastName].filter(Boolean).join(" ");
  return authors.length > 1 ? `${name} et al.` : name;
}

function formatDate(d: string | null): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return ""; }
}

function renderAbstract(abstract: string) {
  const sections = abstract.split(/\n/).reduce<{ label: string; text: string }[]>((acc, line) => {
    const match = line.match(/^([A-Z][A-Z /]+):?\s+(.+)/);
    if (match) acc.push({ label: match[1], text: match[2] });
    else if (acc.length > 0) acc[acc.length - 1].text += " " + line;
    else acc.push({ label: "", text: line });
    return acc;
  }, []);

  const hasLabels = sections.some((s) => s.label);
  return hasLabels ? (
    <>
      {sections.map((s, i) => (
        <div key={i} style={{ marginBottom: i < sections.length - 1 ? "10px" : 0 }}>
          {s.label && (
            <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#5a6a85", display: "block", marginBottom: "2px" }}>
              {s.label}
            </span>
          )}
          {s.text}
        </div>
      ))}
    </>
  ) : <>{abstract}</>;
}

function Spinner({ size = 12 }: { size?: number }) {
  return (
    <svg className="animate-spin" style={{ width: size, height: size, flexShrink: 0 }} viewBox="0 0 24 24" fill="none">
      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

const REJECT_REASONS = [
  "Headline upræcis",
  "Headline forkert fokus",
  "Resumé mangler nøgletal",
  "Resumé forkert fokus",
  "Bottom line gentager titlen",
  "Bottom line mangler kernefund",
] as const;

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  specialty: string;
  label: string;
  scoringEndpoint?: string;
  backHref?: string;
}

export default function TextValidationClient({ specialty, label, scoringEndpoint = "/api/lab/score-condensation-text", backHref = "/admin/lab/condensation-text" }: Props) {
  const router = useRouter();

  const [articles, setArticles]               = useState<CondensationArticle[]>([]);
  const [totalCount, setTotalCount]           = useState(0);
  const [loading, setLoading]                 = useState(true);
  const [selectedId, setSelectedId]           = useState<string | null>(null);

  const [verdicts, setVerdicts]               = useState<Record<string, { decision: "approved" | "rejected"; comment: string; reasons: string[] }>>({});
  const [comments, setComments]               = useState<Record<string, string>>({});
  const [rejectMode, setRejectMode]           = useState(false);
  const [rejectReasons, setRejectReasons]    = useState<Set<string>>(new Set());
  const [scoring, setScoring]                 = useState(false);
  const [scoringProgress, setScoringProgress] = useState<{ scored: number; total: number } | null>(null);
  const [saving, setSaving]                   = useState(false);
  const [toast, setToast]                     = useState<string | null>(null);
  const [pendingHref, setPendingHref]         = useState<string | null>(null);

  const hasUnsavedRef = useRef(false);
  const rejectSectionRef = useRef<HTMLDivElement>(null);

  // ── Load articles (with pre-scoring if needed) ────────────────────────────

  useEffect(() => {
    const abort = new AbortController();

    async function load() {
      setLoading(true);

      // 1. Check for already-scored, not-yet-validated articles
      try {
        const checkRes = await fetch(`/api/admin/training/condensation-text-articles?specialty=${specialty}`, { signal: abort.signal });
        const checkData = await checkRes.json() as { ok: boolean; articles?: CondensationArticle[] };
        const existing = checkData.articles ?? [];

        if (existing.length > 0) {
          populateArticles(existing);
          setLoading(false);
          return;
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        console.error("[TextValidationClient] check failed:", e);
      }

      // 2. None ready — score a new batch
      setLoading(false);
      setScoring(true);
      setScoringProgress(null);

      try {
        const response = await fetch(scoringEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ specialty }),
          signal: abort.signal,
        });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          outer: while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const line of decoder.decode(value).split("\n")) {
              if (!line.startsWith("data: ")) continue;
              try {
                const data = JSON.parse(line.slice(6)) as { scored?: number; total?: number; done?: boolean };
                if (data.done) break outer;
                if (data.scored !== undefined && data.total !== undefined) {
                  setScoringProgress({ scored: data.scored, total: data.total });
                }
              } catch { /* ignore malformed events */ }
            }
          }
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        console.error("[TextValidationClient] scoring failed:", e);
      }

      if (abort.signal.aborted) return;
      setScoring(false);
      setScoringProgress(null);

      // 3. Reload after scoring
      try {
        const res = await fetch(`/api/admin/training/condensation-text-articles?specialty=${specialty}`, { signal: abort.signal });
        const d = await res.json() as { ok: boolean; articles?: CondensationArticle[] };
        populateArticles(d.articles ?? []);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        console.error("[TextValidationClient] reload failed:", e);
      }
    }

    function populateArticles(list: CondensationArticle[]) {
      setArticles(list);
      setTotalCount(list.length);
      setSelectedId(list[0]?.id ?? null);
    }

    void load();
    return () => abort.abort();
  }, [specialty, scoringEndpoint]);

  // ── Browser leave warning ────────────────────────────────────────────────

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!hasUnsavedRef.current) return;
      e.preventDefault();
      e.returnValue = "Du har ureviewede ændringer.";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    function onLinkClick(e: MouseEvent) {
      if (!hasUnsavedRef.current) return;
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("//") || href.startsWith("#")) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
    }
    document.addEventListener("click", onLinkClick, true);
    return () => document.removeEventListener("click", onLinkClick, true);
  }, []);

  useEffect(() => {
    window.history.pushState({ condensationGuard: true }, "");
    function onPopState() {
      if (hasUnsavedRef.current) {
        window.history.pushState({ condensationGuard: true }, "");
        setPendingHref("__back__");
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // ── Verdict handling ────────────────────────────────────────────────────

  function approveArticle(articleId: string) {
    setRejectMode(false);
    setVerdicts((prev) => ({ ...prev, [articleId]: { decision: "approved", comment: "", reasons: [] } }));
  }

  function startReject() {
    setRejectReasons(new Set());
    setRejectMode(true);
  }

  function toggleReason(reason: string) {
    setRejectReasons((prev) => {
      const next = new Set(prev);
      if (next.has(reason)) next.delete(reason);
      else next.add(reason);
      return next;
    });
  }

  function confirmReject(articleId: string) {
    const reasons = REJECT_REASONS.filter((r) => rejectReasons.has(r));
    setVerdicts((prev) => ({
      ...prev,
      [articleId]: {
        decision: "rejected",
        comment:  (comments[articleId] ?? "").trim(),
        reasons,
      },
    }));
    setRejectMode(false);
    setRejectReasons(new Set());
  }

  function cancelReject() {
    setRejectMode(false);
    setRejectReasons(new Set());
  }

  function getComment(articleId: string): string {
    return comments[articleId] ?? "";
  }

  function setComment(articleId: string, value: string) {
    setComments((prev) => ({ ...prev, [articleId]: value }));
  }

  // ── Clear reject mode on article change ──────────────────────────────

  useEffect(() => {
    setRejectMode(false);
    setRejectReasons(new Set());
  }, [selectedId]);

  // ── Scroll reject section into view ──────────────────────────────────────

  useEffect(() => {
    if (rejectMode) {
      requestAnimationFrame(() => {
        rejectSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    }
  }, [rejectMode]);

  // ── Auto-advance on verdict ─────────────────────────────────────────────

  useEffect(() => {
    if (!selectedId || !verdicts[selectedId]) return;
    const idx = articles.findIndex((a) => a.id === selectedId);
    const nextId = idx < articles.length - 1 ? articles[idx + 1].id : null;
    if (nextId) {
      const timer = setTimeout(() => setSelectedId(nextId), 500);
      return () => clearTimeout(timer);
    }
  }, [verdicts, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save ───────────────────────────────────────────────────────────────

  async function handleSave(navigateTo?: string) {
    const destination = navigateTo ?? backHref;
    const toSave = articles
      .filter((a) => verdicts[a.id] != null)
      .map((a) => ({
        article_id:     a.id,
        decision:       verdicts[a.id].decision,
        comment:        verdicts[a.id].comment,
        reject_reasons: verdicts[a.id].reasons,
      }));

    if (toSave.length === 0) return;

    setSaving(true);
    try {
      const res = await fetch("/api/lab/condensation-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialty, module: "condensation_text", decisions: toSave }),
      });
      const data = await res.json() as { ok: boolean; reviewed?: number; error?: string };

      if (data.ok) {
        hasUnsavedRef.current = false;
        setPendingHref(null);
        setToast(`${data.reviewed} artikler valideret`);
        setTimeout(() => {
          router.push(navigateTo === undefined ? backHref : destination);
        }, 2500);
      } else {
        setToast(`Fejl: ${data.error ?? "Ukendt fejl"}`);
        setSaving(false);
      }
    } catch {
      setToast("Netværksfejl — prøv igen");
      setSaving(false);
    }
  }

  // ── Navigation helpers ────────────────────────────────────────────────────

  function goTo(dir: -1 | 1) {
    const idx = articles.findIndex((a) => a.id === selectedId);
    const next = idx + dir;
    if (next >= 0 && next < articles.length) setSelectedId(articles[next].id);
  }

  // ── Derived state ───────────────────────────────────────────────────────

  const currentArticle   = articles.find((a) => a.id === selectedId) ?? null;
  const currentVerdict   = currentArticle ? (verdicts[currentArticle.id] ?? null) : null;
  const reviewedCount    = articles.filter((a) => verdicts[a.id] != null).length;
  const hasAnyVerdict    = reviewedCount > 0;
  hasUnsavedRef.current  = hasAnyVerdict;

  const visibleIdx       = articles.findIndex((a) => a.id === selectedId);
  const isFirst          = visibleIdx <= 0;
  const isLast           = visibleIdx >= articles.length - 1;

  const isApproved = currentVerdict?.decision === "approved";
  const isRejected = currentVerdict?.decision === "rejected";

  // ── Loading / empty states ──────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f7fa", color: "#888", fontSize: "14px" }}>
        Loading articles…
      </div>
    );
  }

  if (scoring) {
    return (
      <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f5f7fa", gap: "16px" }}>
        <Spinner size={28} />
        <div style={{ fontSize: "16px", fontWeight: 600, color: "#1a1a1a" }}>Kondenserer artikler med AI…</div>
        <div style={{ fontSize: "13px", color: "#888" }}>
          {scoringProgress
            ? `${scoringProgress.scored} / ${scoringProgress.total} artikler kondenseret…`
            : `Forbereder kondensering…`}
        </div>
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f5f7fa", gap: "12px" }}>
        <div style={{ fontSize: "18px", fontWeight: 700, color: "#1a1a1a" }}>Ingen artikler at validere</div>
        <div style={{ fontSize: "14px", color: "#888" }}>Alle tekst-felter for {label} er allerede valideret.</div>
        <button onClick={() => router.push(backHref)} style={{ marginTop: "12px", borderRadius: "8px", padding: "10px 20px", background: "#1a1a1a", color: "#fff", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
          ← Tilbage til Kondensering
        </button>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Header bar */}
      <header style={{ height: "48px", background: "#fff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", padding: "0 20px", flexShrink: 0, gap: "12px" }}>
        <a href={backHref} style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none", flexShrink: 0 }}>
          ← Kondensering
        </a>
        <span style={{ color: "#dde3ed", flexShrink: 0 }}>·</span>
        <span style={{ fontSize: "13px", color: "#1a1a1a", fontWeight: 600, flexShrink: 0 }}>
          Tekst-validering · {label}
        </span>

        <div style={{ flex: 1 }} />

        {/* Navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          <button
            onClick={() => goTo(-1)}
            disabled={isFirst}
            style={{ width: "28px", height: "28px", borderRadius: "6px", border: "1px solid #e5e7eb", background: "#fff", color: isFirst ? "#ccc" : "#5a6a85", cursor: isFirst ? "default" : "pointer", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            ←
          </button>
          <span style={{ fontSize: "12px", color: "#888", minWidth: "60px", textAlign: "center" }}>
            {visibleIdx + 1} / {totalCount}
          </span>
          <button
            onClick={() => goTo(1)}
            disabled={isLast}
            style={{ width: "28px", height: "28px", borderRadius: "6px", border: "1px solid #e5e7eb", background: "#fff", color: isLast ? "#ccc" : "#5a6a85", cursor: isLast ? "default" : "pointer", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            →
          </button>
        </div>

        <span style={{ color: "#e5e7eb", flexShrink: 0 }}>|</span>

        {/* Review counter + save */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <span style={{ fontSize: "12px", color: "#888" }}>
            <strong style={{ color: "#059669" }}>{reviewedCount}</strong> af {totalCount} reviewed
          </span>
          <button
            onClick={() => void handleSave()}
            disabled={!hasAnyVerdict || saving}
            style={{
              borderRadius: "6px", padding: "5px 14px", fontSize: "12px", fontWeight: 700,
              background: hasAnyVerdict && !saving ? "#059669" : "#e2e8f0",
              border: "none",
              color: hasAnyVerdict && !saving ? "#fff" : "#94a3b8",
              cursor: hasAnyVerdict && !saving ? "pointer" : "not-allowed",
              display: "inline-flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap",
            }}
          >
            {saving ? <><Spinner size={10} /> Gemmer…</> : <>Gem {reviewedCount > 0 ? `(${reviewedCount})` : ""}</>}
          </button>
        </div>
      </header>

      {/* Splitscreen */}
      {currentArticle ? (
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

          {/* LEFT — Article info */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", borderRight: "1px solid #e5e7eb" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "32px 36px" }}>
              {currentVerdict && (
                <div style={{ fontSize: "11px", fontWeight: 700, color: isApproved ? "#15803d" : "#dc2626", marginBottom: "8px", display: "flex", alignItems: "center", gap: "4px" }}>
                  {isApproved ? "✓ Godkendt" : "✗ Afvist"}
                </div>
              )}

              <h2 style={{ fontSize: "18px", fontWeight: 700, lineHeight: 1.4, margin: "0 0 10px" }}>
                {currentArticle.title}
              </h2>

              <div style={{ fontSize: "13px", color: "#888", marginBottom: "28px", lineHeight: 1.5 }}>
                {currentArticle.journal_abbr && <span style={{ fontWeight: 500 }}>{currentArticle.journal_abbr}</span>}
                {currentArticle.journal_abbr && formatDate(currentArticle.published_date) && " · "}
                {formatDate(currentArticle.published_date)}
                {firstAuthor(currentArticle.authors) && ` · ${firstAuthor(currentArticle.authors)}`}
                {currentArticle.pubmed_id && (
                  <>
                    {" · "}
                    <a href={`https://pubmed.ncbi.nlm.nih.gov/${currentArticle.pubmed_id}/`} target="_blank" rel="noopener noreferrer" style={{ color: "#1a6eb5", textDecoration: "none" }}>
                      PMID {currentArticle.pubmed_id} ↗
                    </a>
                  </>
                )}
              </div>

              {currentArticle.abstract && (
                <>
                  <div style={{ fontSize: "10px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "10px" }}>
                    Abstract
                  </div>
                  <div style={{ fontSize: "13px", lineHeight: 1.8, color: "#2a2a2a" }}>
                    {renderAbstract(currentArticle.abstract)}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* RIGHT — Text validation */}
          <div style={{ width: "420px", flexShrink: 0, display: "flex", flexDirection: "column", background: "#fafbfc" }}>
            <div style={{ flex: 1, padding: "28px 24px 24px", display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto" }}>

              <div style={{
                background: isApproved ? "#f0fdf4" : isRejected ? "#fef2f2" : "#fff",
                border: `1px solid ${isApproved ? "#bbf7d0" : isRejected ? "#fecaca" : "#e2e8f0"}`,
                borderRadius: "8px",
                overflow: "hidden",
              }}>
                {/* Content */}
                <div style={{ padding: "16px 16px 14px" }}>
                  {currentArticle.short_headline && (
                    <div style={{ marginBottom: "12px" }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "4px" }}>Headline</div>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a1a", lineHeight: 1.4 }}>
                        {currentArticle.short_headline}
                      </div>
                    </div>
                  )}
                  {currentArticle.short_resume && (
                    <div style={{ marginBottom: "12px" }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "4px" }}>Resumé</div>
                      <div style={{ fontSize: "14px", color: "#2a2a2a", lineHeight: 1.6 }}>
                        {currentArticle.short_resume}
                      </div>
                    </div>
                  )}
                  {currentArticle.bottom_line && (
                    <div style={{ marginBottom: "0" }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "4px" }}>Bottom line</div>
                      <div style={{
                        background: "#f9fafb",
                        borderLeft: "3px solid #059669",
                        padding: "12px",
                        fontSize: "13px",
                        color: "#2a2a2a",
                        lineHeight: 1.5,
                        fontStyle: "italic",
                      }}>
                        {currentArticle.bottom_line}
                      </div>
                    </div>
                  )}
                  {!currentArticle.short_headline && !currentArticle.short_resume && !currentArticle.bottom_line && (
                    <div style={{ fontSize: "13px", color: "#aaa" }}>Ingen tekst genereret</div>
                  )}

                </div>

                {/* Actions */}
                <div ref={rejectSectionRef} style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {rejectMode ? (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {REJECT_REASONS.map((reason) => (
                          <label
                            key={reason}
                            style={{
                              display: "flex", alignItems: "center", gap: "6px",
                              fontSize: "12px", color: "#1a1a1a", cursor: "pointer",
                              padding: "3px 0",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={rejectReasons.has(reason)}
                              onChange={() => toggleReason(reason)}
                              style={{ accentColor: "#dc2626", margin: 0 }}
                            />
                            {reason}
                          </label>
                        ))}
                      </div>
                      <textarea
                        value={getComment(currentArticle.id)}
                        onChange={(e) => setComment(currentArticle.id, e.target.value)}
                        placeholder="Eventuelt uddybende kommentar..."
                        style={{
                          width: "100%", minHeight: "44px", padding: "8px 10px", fontSize: "12px",
                          border: "1px solid #e2e8f0", borderRadius: "5px", resize: "vertical",
                          outline: "none", fontFamily: "inherit", background: "#fff",
                        }}
                      />
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          onClick={() => confirmReject(currentArticle.id)}
                          disabled={rejectReasons.size === 0}
                          style={{
                            borderRadius: "5px", padding: "5px 14px", fontSize: "11px", fontWeight: 600,
                            background: rejectReasons.size > 0 ? "#dc2626" : "#e2e8f0",
                            border: `1px solid ${rejectReasons.size > 0 ? "#dc2626" : "#e2e8f0"}`,
                            color: rejectReasons.size > 0 ? "#fff" : "#94a3b8",
                            cursor: rejectReasons.size > 0 ? "pointer" : "not-allowed",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Bekræft afvisning
                        </button>
                        <button
                          onClick={() => cancelReject()}
                          style={{
                            borderRadius: "5px", padding: "5px 14px", fontSize: "11px", fontWeight: 600,
                            background: "#fff", border: "1px solid #dde3ed", color: "#5a6a85",
                            cursor: "pointer", whiteSpace: "nowrap",
                          }}
                        >
                          Fortryd
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        onClick={() => approveArticle(currentArticle.id)}
                        style={{
                          borderRadius: "5px", padding: "5px 14px", fontSize: "11px", fontWeight: 600,
                          background: isApproved ? "#15803d" : "#fff",
                          border: `1px solid ${isApproved ? "#15803d" : "#bbf7d0"}`,
                          color: isApproved ? "#fff" : "#15803d",
                          cursor: "pointer", whiteSpace: "nowrap",
                        }}
                      >
                        ✓ Godkend
                      </button>
                      <button
                        onClick={() => startReject()}
                        style={{
                          borderRadius: "5px", padding: "5px 14px", fontSize: "11px", fontWeight: 600,
                          background: isRejected ? "#dc2626" : "#fff",
                          border: `1px solid ${isRejected ? "#dc2626" : "#fecaca"}`,
                          color: isRejected ? "#fff" : "#dc2626",
                          cursor: "pointer", whiteSpace: "nowrap",
                        }}
                      >
                        ✗ Afvis
                      </button>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: "14px" }}>
          Ingen artikel valgt
        </div>
      )}

      {/* Progress bar */}
      <div style={{ height: "3px", background: "#e2e8f0", flexShrink: 0 }}>
        <div style={{ height: "100%", width: `${totalCount > 0 ? Math.round((reviewedCount / totalCount) * 100) : 0}%`, background: "#059669", transition: "width 0.3s" }} />
      </div>

      {/* Unsaved changes modal */}
      {pendingHref && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 8px 40px rgba(0,0,0,0.2)", padding: "28px 32px", maxWidth: "420px", width: "90%", fontFamily: "var(--font-inter), Inter, sans-serif" }}>
            <div style={{ fontSize: "17px", fontWeight: 700, marginBottom: "10px" }}>Gem din session?</div>
            <div style={{ fontSize: "14px", color: "#5a6a85", marginBottom: "24px", lineHeight: 1.6 }}>
              Du har valideret <strong style={{ color: "#1a1a1a" }}>{reviewedCount}</strong> artikel{reviewedCount !== 1 ? "er" : ""} som ikke er gemt endnu.
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                onClick={() => setPendingHref(null)}
                style={{ flex: "1 1 auto", padding: "9px 14px", borderRadius: "8px", border: "1px solid #dde3ed", background: "#fff", color: "#1a1a1a", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              >
                Bliv på siden
              </button>
              <button
                onClick={() => {
                  hasUnsavedRef.current = false;
                  if (pendingHref === "__back__") { window.history.go(-2); }
                  else { router.push(pendingHref); }
                }}
                style={{ flex: "1 1 auto", padding: "9px 14px", borderRadius: "8px", border: "1px solid #dde3ed", background: "#fff", color: "#888", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}
              >
                Forlad uden at gemme
              </button>
              <button
                onClick={() => void handleSave(pendingHref === "__back__" ? undefined : pendingHref)}
                disabled={saving}
                style={{ flex: "1 1 auto", padding: "9px 14px", borderRadius: "8px", border: "none", background: "#059669", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                {saving ? <><Spinner size={12} /> Gemmer…</> : "Bekræft & gem →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: "32px", left: "50%", transform: "translateX(-50%)", background: "#1a1a1a", color: "#fff", padding: "12px 28px", borderRadius: "10px", fontSize: "14px", fontWeight: 600, zIndex: 1000, boxShadow: "0 4px 20px rgba(0,0,0,0.25)", whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
