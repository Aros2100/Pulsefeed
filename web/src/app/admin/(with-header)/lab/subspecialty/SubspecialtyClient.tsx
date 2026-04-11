"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClassificationArticle {
  id: string;
  title: string;
  journal_abbr: string | null;
  journal_title: string | null;
  published_date: string | null;
  abstract: string | null;
  pubmed_id: string | null;
  authors: unknown;
  subspecialty_ai: string | string[] | null;
  subspecialty_reason: string | null;
  circle: number | null;
}

interface ArticleVerdict {
  decision: string[];
  ai_decision: string[];
  corrected: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseAiTags(raw: string | string[] | null): string[] {
  if (!raw) return [];
  // Supabase returns TEXT[] as a JS array directly
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === "string");
  // PostgreSQL array literal: {"Spine surgery","Neurotraumatology"}
  if (raw.startsWith("{") && raw.endsWith("}")) {
    return raw.slice(1, -1).split(",").map((s) => s.replace(/^"|"$/g, "").trim()).filter(Boolean);
  }
  // JSON string
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === "string");
    if (typeof parsed === "string") return [parsed];
  } catch {
    if (raw.trim()) return [raw.trim()];
  }
  return [];
}

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

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted1 = [...a].sort();
  const sorted2 = [...b].sort();
  return sorted1.every((v, i) => v === sorted2[i]);
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  specialty: string;
  label: string;
  subspecialties: string[];
}

export default function SubspecialtyClient({ specialty, label, subspecialties }: Props) {
  const router = useRouter();

  const [articles, setArticles]               = useState<ClassificationArticle[]>([]);
  const [totalCount, setTotalCount]           = useState(0);
  const [loading, setLoading]                 = useState(true);
  const [selectedId, setSelectedId]           = useState<string | null>(null);

  const [verdicts, setVerdicts]               = useState<Record<string, ArticleVerdict>>({});
  const [checkedSubs, setCheckedSubs]         = useState<string[]>([]);
  const [scoring, setScoring]                 = useState(false);
  const [scoringProgress, setScoringProgress] = useState<{ scored: number; failed: number; total: number } | null>(null);
const [saving, setSaving]                   = useState(false);
  const [toast, setToast]                     = useState<string | null>(null);
  const [pendingHref, setPendingHref]         = useState<string | null>(null);

  const hasUnsavedRef = useRef(false);
  const justVerdictedRef = useRef<string | null>(null);

  // Reset checkboxes when article changes
  useEffect(() => {
    setCheckedSubs([]);
  }, [selectedId]);

  // ── Load articles (with pre-scoring if needed) ────────────────────────────

  useEffect(() => {
    const abort = new AbortController();

    async function loadArticles() {
      setLoading(true);

      let d: { ok: boolean; articles?: ClassificationArticle[] };
      try {
        d = await fetch(`/api/admin/training/subspecialty-articles?specialty=${specialty}`, { signal: abort.signal })
          .then((r) => r.json()) as { ok: boolean; articles?: ClassificationArticle[] };
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setLoading(false);
        return;
      }

      if (!d.ok) { setLoading(false); return; }

      const list = d.articles ?? [];

      if (list.length >= 100) {
        setLoading(false);
        populateArticles(list);
      } else {
        setScoring(true);
        setScoringProgress(null);
        setLoading(false);

        try {
          const response = await fetch("/api/lab/score-subspecialty", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ specialty }),
            signal: abort.signal,
          });

          const reader = response.body!.getReader();
          const decoder = new TextDecoder();

          outer: while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const line of decoder.decode(value).split("\n")) {
              if (!line.startsWith("data: ")) continue;
              try {
                const data = JSON.parse(line.slice(6)) as {
                  scored?: number; failed?: number; total?: number; done?: boolean;
                };
                if (data.done) break outer;
                if (data.scored !== undefined && data.total !== undefined) {
                  setScoringProgress({ scored: data.scored, failed: data.failed ?? 0, total: data.total });
                }
              } catch { /* ignore malformed events */ }
            }
          }
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
        }

        if (abort.signal.aborted) return;
        setScoring(false);
        setScoringProgress(null);

        // Reload with fresh scores
        let d2: { ok: boolean; articles?: ClassificationArticle[] };
        try {
          d2 = await fetch(`/api/admin/training/subspecialty-articles?specialty=${specialty}`, { signal: abort.signal })
            .then((r) => r.json()) as { ok: boolean; articles?: ClassificationArticle[] };
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
          return;
        }
        populateArticles(d2.articles ?? []);
      }
    }

    function populateArticles(list: ClassificationArticle[]) {
      setArticles(list);
      setTotalCount(list.length);
      setSelectedId(list[0]?.id ?? null);
    }

    void loadArticles();
    return () => abort.abort();
  }, [specialty]);

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

  // ── Internal navigation warning ─────────────────────────────────────────

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

  // ── Back button guard ───────────────────────────────────────────────────

  useEffect(() => {
    window.history.pushState({ classificationGuard: true }, "");
    function onPopState() {
      if (hasUnsavedRef.current) {
        window.history.pushState({ classificationGuard: true }, "");
        setPendingHref("__back__");
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // ── Verdict handling ────────────────────────────────────────────────────

  function approveAi(articleId: string, aiTags: string[]) {
    justVerdictedRef.current = articleId;
    setVerdicts((prev) => ({
      ...prev,
      [articleId]: {
        decision: aiTags,
        ai_decision: aiTags,
        corrected: false,
      },
    }));
  }

  function correctArticle(articleId: string, aiTags: string[], editorTags: string[]) {
    justVerdictedRef.current = articleId;
    const corrected = !arraysEqual(editorTags, aiTags);
    setVerdicts((prev) => ({
      ...prev,
      [articleId]: {
        decision: editorTags,
        ai_decision: aiTags,
        corrected,
      },
    }));
  }

  // ── Auto-advance when verdict set ─────────────────────────────────────

  function isArticleComplete(articleId: string): boolean {
    return verdicts[articleId] != null;
  }

  useEffect(() => {
    if (!selectedId || !isArticleComplete(selectedId)) return;
    if (justVerdictedRef.current !== selectedId) return; // navigated back — don't auto-advance
    justVerdictedRef.current = null;
    const idx = articles.findIndex((a) => a.id === selectedId);
    const nextId = idx < articles.length - 1 ? articles[idx + 1].id : null;
    if (nextId) {
      const timer = setTimeout(() => setSelectedId(nextId), 500);
      return () => clearTimeout(timer);
    }
  }, [verdicts, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Bekræft & gem ───────────────────────────────────────────────────────

  async function handleSave(navigateTo?: string) {
    const destination = navigateTo ?? "/admin/lab/subspecialty";
    const toSave = articles
      .filter((a) => isArticleComplete(a.id))
      .map((a) => ({
        article_id:  a.id,
        decision:    JSON.stringify(verdicts[a.id].decision),
        ai_decision: JSON.stringify(verdicts[a.id].ai_decision),
        corrected:   verdicts[a.id].corrected,
      }));

    if (toSave.length === 0) return;

    setSaving(true);
    try {
      const res = await fetch("/api/lab/subspecialty-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialty, verdicts: toSave }),
      });
      const data = await res.json() as { ok: boolean; reviewed?: number; error?: string };

      if (data.ok) {
        hasUnsavedRef.current = false;
        setPendingHref(null);
        setToast(`${data.reviewed} artikler klassificeret`);
        setTimeout(() => {
          router.push(navigateTo === undefined ? "/admin/lab/subspecialty" : destination);
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

  // ── Checkbox handling ─────────────────────────────────────────────────────

  const PEDIATRIC = "Pediatric and foetal neurosurgery";
  const maxCorrections = checkedSubs.includes(PEDIATRIC) ? 3 : 2;

  function toggleCheckbox(option: string) {
    setCheckedSubs((prev) => {
      if (prev.includes(option)) return prev.filter((s) => s !== option);
      const nextMax = option === PEDIATRIC ? 3 : prev.includes(PEDIATRIC) ? 3 : 2;
      if (prev.length >= nextMax) return prev;
      return [...prev, option];
    });
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
  const reviewedCount    = articles.filter((a) => isArticleComplete(a.id)).length;
  const hasAnyVerdict    = reviewedCount > 0;
  hasUnsavedRef.current  = hasAnyVerdict;

  const visibleIdx       = articles.findIndex((a) => a.id === selectedId);
  const isFirst          = visibleIdx <= 0;
  const isLast           = visibleIdx >= articles.length - 1;
  const currentComplete  = currentArticle ? isArticleComplete(currentArticle.id) : false;

  const aiTags = currentArticle ? parseAiTags(currentArticle.subspecialty_ai) : [];

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
        <div style={{ fontSize: "16px", fontWeight: 600, color: "#1a1a1a" }}>Klassificerer artikler med AI…</div>
        <div style={{ fontSize: "13px", color: "#888" }}>
          {scoringProgress
            ? `${scoringProgress.scored} / ${scoringProgress.total} artikler klassificeret${scoringProgress.failed > 0 ? ` (${scoringProgress.failed} fejlet)` : ""}…`
            : `Forbereder klassificering…`}
        </div>
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f5f7fa", gap: "12px" }}>
        <div style={{ fontSize: "18px", fontWeight: 700, color: "#1a1a1a" }}>Ingen artikler at klassificere</div>
        <div style={{ fontSize: "14px", color: "#888" }}>Alle artikler for {label} er allerede klassificeret.</div>
        <button onClick={() => router.push("/admin/lab/subspecialty")} style={{ marginTop: "12px", borderRadius: "8px", padding: "10px 20px", background: "#1a1a1a", color: "#fff", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
          ← Tilbage til Subspecialer
        </button>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Header bar */}
      <header style={{ height: "48px", background: "#fff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", padding: "0 20px", flexShrink: 0, gap: "12px" }}>
        <a href="/admin/lab/subspecialty" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none", flexShrink: 0 }}>
          ← Subspecialer
        </a>
        <span style={{ color: "#dde3ed", flexShrink: 0 }}>·</span>
        <span style={{ fontSize: "13px", color: "#1a1a1a", fontWeight: 600, flexShrink: 0 }}>
          Session · {label}
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
            <strong style={{ color: "#7c3aed" }}>{reviewedCount}</strong> af {totalCount} reviewed
          </span>
          <button
            onClick={() => void handleSave()}
            disabled={!hasAnyVerdict || saving}
            style={{
              borderRadius: "6px",
              padding: "5px 14px",
              fontSize: "12px",
              fontWeight: 700,
              background: hasAnyVerdict && !saving ? "#7c3aed" : "#e2e8f0",
              border: "none",
              color: hasAnyVerdict && !saving ? "#fff" : "#94a3b8",
              cursor: hasAnyVerdict && !saving ? "pointer" : "not-allowed",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              whiteSpace: "nowrap",
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
              {/* Status indicator */}
              {currentComplete && (
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#15803d", marginBottom: "8px", display: "flex", alignItems: "center", gap: "4px" }}>
                  ✓ Klassificeret
                </div>
              )}

              {/* Title */}
              <h2 style={{ fontSize: "18px", fontWeight: 700, lineHeight: 1.4, margin: "0 0 10px" }}>
                {currentArticle.title}
              </h2>

              {/* Meta */}
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

              {/* Abstract */}
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

          {/* RIGHT — Classification */}
          <div style={{ width: "440px", flexShrink: 0, display: "flex", flexDirection: "column", background: "#fafbfc" }}>
            <div style={{ flex: 1, padding: "28px 24px 24px", display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto" }}>

              {/* AI Subspecialty badges */}
              <div>
                <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#7c3aed", marginBottom: "8px" }}>
                  AI Subspecialty
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {aiTags.length > 0 ? aiTags.map((tag) => (
                    <span key={tag} style={{
                      fontSize: "13px", fontWeight: 700, color: "#7c3aed",
                      background: "#f5f3ff", border: "1px solid #ddd6fe",
                      borderRadius: "5px", padding: "4px 10px",
                    }}>
                      {tag}
                    </span>
                  )) : (
                    <span style={{ fontSize: "13px", color: "#999" }}>—</span>
                  )}
                  {currentVerdict && !currentVerdict.corrected && (
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#15803d", alignSelf: "center", marginLeft: "4px" }}>✓ Godkendt</span>
                  )}
                  {currentVerdict?.corrected && (
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#dc2626", alignSelf: "center", marginLeft: "4px" }}>Korrigeret → {currentVerdict.decision.join(", ")}</span>
                  )}
                </div>
              </div>

              {/* AI Begrundelse — full text */}
              {currentArticle.subspecialty_reason && (
                <div style={{ background: "#f3f0ff", border: "1px solid #e9e0ff", borderRadius: "8px", padding: "12px 14px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#7c3aed", marginBottom: "4px" }}>
                    AI Begrundelse
                  </div>
                  <div style={{ fontSize: "12px", color: "#4a4a4a", lineHeight: 1.6 }}>
                    {currentArticle.subspecialty_reason}
                  </div>
                </div>
              )}

              {/* Godkend AI button — green, full width */}
              <button
                onClick={() => approveAi(currentArticle.id, aiTags.length > 0 ? aiTags : ["Unknown"])}
                style={{
                  borderRadius: "6px",
                  padding: "9px 14px",
                  fontSize: "13px",
                  fontWeight: 700,
                  background: currentVerdict && !currentVerdict.corrected ? "#15803d" : "#16a34a",
                  border: "none",
                  color: "#fff",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                ✓ Godkend AI
              </button>

              {/* Korrektion — two-column checkboxes */}
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#5a6a85", marginBottom: "8px" }}>
                  Korriger (vælg 1–{maxCorrections}) — {checkedSubs.length} af {maxCorrections} valgt
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px 12px" }}>
                  {subspecialties.map((option) => {
                    const isChecked = checkedSubs.includes(option);
                    const isDisabled = !isChecked && checkedSubs.length >= maxCorrections;
                    return (
                      <label
                        key={option}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "3px 4px",
                          borderRadius: "3px",
                          cursor: isDisabled ? "not-allowed" : "pointer",
                          background: isChecked ? "#fef2f2" : "transparent",
                          opacity: isDisabled ? 0.35 : 1,
                          fontSize: "12px",
                          color: isChecked ? "#dc2626" : "#1a1a1a",
                          fontWeight: isChecked ? 600 : 400,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isDisabled}
                          onChange={() => toggleCheckbox(option)}
                          style={{ accentColor: "#dc2626", cursor: isDisabled ? "not-allowed" : "pointer", width: "13px", height: "13px" }}
                        />
                        {option}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Godkend korrektion button — red, full width */}
              {checkedSubs.length > 0 && (
                <button
                  onClick={() => correctArticle(currentArticle.id, aiTags.length > 0 ? aiTags : ["Unknown"], checkedSubs)}
                  style={{
                    borderRadius: "6px",
                    padding: "9px 14px",
                    fontSize: "13px",
                    fontWeight: 700,
                    background: "#dc2626",
                    border: "none",
                    color: "#fff",
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  Godkend korrektion ({checkedSubs.length})
                </button>
              )}
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
        <div style={{ height: "100%", width: `${totalCount > 0 ? Math.round((reviewedCount / totalCount) * 100) : 0}%`, background: "#7c3aed", transition: "width 0.3s" }} />
      </div>

      {/* Unsaved changes modal */}
      {pendingHref && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div style={{ background: "#fff", borderRadius: "12px", boxShadow: "0 8px 40px rgba(0,0,0,0.2)", padding: "28px 32px", maxWidth: "420px", width: "90%", fontFamily: "var(--font-inter), Inter, sans-serif" }}>
            <div style={{ fontSize: "17px", fontWeight: 700, marginBottom: "10px" }}>Gem din session?</div>
            <div style={{ fontSize: "14px", color: "#5a6a85", marginBottom: "24px", lineHeight: 1.6 }}>
              Du har klassificeret <strong style={{ color: "#1a1a1a" }}>{reviewedCount}</strong> artikel{reviewedCount !== 1 ? "er" : ""} som ikke er gemt endnu.
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
                style={{ flex: "1 1 auto", padding: "9px 14px", borderRadius: "8px", border: "none", background: "#7c3aed", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
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
