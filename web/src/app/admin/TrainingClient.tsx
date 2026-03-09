"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type EditorVerdict = "relevant" | "not_relevant";
type ConfidenceFilter = "all" | "high" | "medium" | "low";

interface TrainingArticle {
  id: string;
  title: string;
  journal_abbr: string | null;
  published_date: string | null;
  abstract: string | null;
  pubmed_id: string;
  authors: unknown;
  specialty_confidence: number | null;
  ai_decision: string | null;
  circle: number | null;
}

interface AIData {
  verdict: EditorVerdict | null;
  confidence: number | null;
  aiDecision: string | null;
  loading: boolean;
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

function formatShortDate(d: string | null): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch { return ""; }
}

function scoreToVerdict(score: number): EditorVerdict {
  return score >= 50 ? "relevant" : "not_relevant";
}

function applyConfFilter(articles: TrainingArticle[], filter: ConfidenceFilter): TrainingArticle[] {
  if (filter === "all") return articles;
  return articles.filter((a) => {
    const s = a.specialty_confidence;
    if (s == null) return false;
    if (filter === "high")   return s >= 70;
    if (filter === "medium") return s >= 40 && s < 70;
    if (filter === "low")    return s < 40;
    return true;
  });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ConfidenceBadge({ score, aiDecision }: { score: number | null; aiDecision?: string | null }) {
  if (score == null) {
    return (
      <span style={{ fontSize: "10px", fontWeight: 700, background: "#f1f5f9", color: "#94a3b8", border: "1px solid #e2e8f0", borderRadius: "4px", padding: "1px 6px", flexShrink: 0 }}>
        Not scored
      </span>
    );
  }
  let bg: string, color: string, border: string;
  if (aiDecision === "approved") {
    bg = "#f0fdf4"; color = "#15803d"; border = "#bbf7d0";
  } else if (aiDecision === "rejected") {
    bg = "#fef2f2"; color = "#dc2626"; border = "#fecaca";
  } else {
    bg     = score >= 70 ? "#f0fdf4" : score >= 40 ? "#fefce8" : "#fef2f2";
    color  = score >= 70 ? "#15803d" : score >= 40 ? "#d97706" : "#dc2626";
    border = score >= 70 ? "#bbf7d0" : score >= 40 ? "#fde68a" : "#fecaca";
  }
  return (
    <span style={{ fontSize: "10px", fontWeight: 700, background: bg, color, border: `1px solid ${border}`, borderRadius: "4px", padding: "1px 6px", flexShrink: 0 }}>
      {score}%
    </span>
  );
}

function CircleBadge({ circle }: { circle: number | null }) {
  if (circle == null) return null;
  const colors: Record<number, { bg: string; color: string }> = {
    1: { bg: "#eff6ff", color: "#1d4ed8" },
    2: { bg: "#f5f3ff", color: "#7c3aed" },
    3: { bg: "#f0fdf4", color: "#15803d" },
  };
  const c = colors[circle] ?? { bg: "#f1f5f9", color: "#475569" };
  return (
    <span style={{ fontSize: "10px", fontWeight: 700, background: c.bg, color: c.color, borderRadius: "4px", padding: "1px 5px", flexShrink: 0 }}>
      C{circle}
    </span>
  );
}

function AITopbarBadge({ ai }: { ai: AIData | undefined }) {
  if (!ai) return <span style={{ fontSize: "12px", color: "#aaa" }}>AI: —</span>;
  if (ai.loading) {
    return (
      <span style={{ fontSize: "12px", color: "#aaa", display: "flex", alignItems: "center", gap: "5px" }}>
        <Spinner size={11} /> AI…
      </span>
    );
  }
  const score = ai.confidence;
  if (score == null) {
    return (
      <span style={{ fontSize: "12px", fontWeight: 600, background: "#f1f5f9", color: "#94a3b8", border: "1px solid #e2e8f0", borderRadius: "999px", padding: "3px 12px", whiteSpace: "nowrap" }}>
        Not scored
      </span>
    );
  }

  let bg: string, color: string, border: string;
  if (ai.aiDecision === "approved") {
    bg = "#f0fdf4"; color = "#15803d"; border = "#bbf7d0";
  } else if (ai.aiDecision === "rejected") {
    bg = "#fef2f2"; color = "#dc2626"; border = "#fecaca";
  } else {
    bg     = score >= 70 ? "#f0fdf4" : score >= 40 ? "#fefce8" : "#fef2f2";
    color  = score >= 70 ? "#15803d" : score >= 40 ? "#d97706" : "#dc2626";
    border = score >= 70 ? "#bbf7d0" : score >= 40 ? "#fde68a" : "#fecaca";
  }
  return (
    <span style={{ fontSize: "12px", fontWeight: 700, background: bg, color, border: `1px solid ${border}`, borderRadius: "999px", padding: "3px 12px", whiteSpace: "nowrap" }}>
      AI: {score}% confident
    </span>
  );
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
        <div key={i} style={{ marginBottom: i < sections.length - 1 ? "14px" : 0 }}>
          {s.label && (
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#5a6a85", display: "block", marginBottom: "3px" }}>
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

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  specialty: string;
  label: string;
}

export default function TrainingClient({ specialty, label }: Props) {
  const router = useRouter();

  const [articles, setArticles]               = useState<TrainingArticle[]>([]);
  const [totalCount, setTotalCount]           = useState(0);
  const [loading, setLoading]                 = useState(true);
  const [selectedId, setSelectedId]           = useState<string | null>(null);
  const [confidenceFilter, setConfFilter]     = useState<ConfidenceFilter>("all");

  // Editor verdicts — local only until Bekræft & gem
  const [verdicts, setVerdicts]               = useState<Record<string, EditorVerdict | null>>({});
  // Disagreement reasons — only used when verdict=not_relevant and AI said relevant
  const [reasons, setReasons]                 = useState<Record<string, string>>({});
  const [otherText, setOtherText]             = useState<Record<string, string>>({});
  // AI data per article
  const [aiData, setAiData]                   = useState<Record<string, AIData>>({});

  const [scoring, setScoring]                 = useState(false);
  const [scoringProgress, setScoringProgress] = useState<{ scored: number; total: number } | null>(null);
  const [saving, setSaving]                   = useState(false);
  const [toast, setToast]                     = useState<string | null>(null);
  const [pendingHref, setPendingHref]         = useState<string | null>(null);

  const splitRef          = useRef<HTMLDivElement>(null);
  const isDragging        = useRef(false);
  const fetchedAI         = useRef<Set<string>>(new Set());
  const advanceTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUnsavedRef     = useRef(false);
  const [panelWidth, setPanelWidth] = useState(420);

  // ── Load articles (with pre-scoring if needed) ────────────────────────────

  useEffect(() => {
    const abort = new AbortController();

    async function loadArticles() {
      setLoading(true);

      let d: { ok: boolean; articles?: TrainingArticle[] };
      try {
        d = await fetch(`/api/admin/training/articles?specialty=${specialty}`, { signal: abort.signal })
          .then((r) => r.json()) as { ok: boolean; articles?: TrainingArticle[] };
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setLoading(false);
        return;
      }

      if (!d.ok) { setLoading(false); return; }

      const list = d.articles ?? [];

      // If we already have 100 scored articles waiting, show them directly.
      // Otherwise, call score-batch to fill up to 100, then reload.
      if (list.length >= 100) {
        setLoading(false);
        populateArticles(list);
      } else {
        setScoring(true);
        setScoringProgress(null);
        setLoading(false);

        try {
          const response = await fetch("/api/lab/score-batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ specialty, scoreAll: false }),
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
                  scored?: number; total?: number; done?: boolean;
                };
                if (data.done) break outer;
                if (data.scored !== undefined && data.total !== undefined) {
                  setScoringProgress({ scored: data.scored, total: data.total });
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
        let d2: { ok: boolean; articles?: TrainingArticle[] };
        try {
          d2 = await fetch(`/api/admin/training/articles?specialty=${specialty}`, { signal: abort.signal })
            .then((r) => r.json()) as { ok: boolean; articles?: TrainingArticle[] };
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
          return;
        }
        populateArticles(d2.articles ?? []);
      }
    }

    function populateArticles(list: TrainingArticle[]) {
      const initialAI: Record<string, AIData> = {};
      for (const a of list) {
        if (a.specialty_confidence != null) {
          initialAI[a.id] = {
            verdict: scoreToVerdict(a.specialty_confidence),
            confidence: a.specialty_confidence,
            aiDecision: a.ai_decision,
            loading: false,
          };
          fetchedAI.current.add(a.id);
        }
      }

      setAiData(initialAI);
      setArticles(list);
      setTotalCount(list.length);
      setSelectedId(list[0]?.id ?? null);
    }

    void loadArticles();
    return () => abort.abort();
  }, [specialty]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pre-fetch AI verdict when selected article changes ────────────────────

  useEffect(() => {
    if (!selectedId) return;
    if (fetchedAI.current.has(selectedId)) return;
    fetchedAI.current.add(selectedId);

    setAiData((prev) => ({
      ...prev,
      [selectedId]: { verdict: null, confidence: null, aiDecision: null, loading: true },
    }));

    void fetch(`/api/admin/training/ai-verdict?articleId=${selectedId}&specialty=${specialty}`)
      .then((r) => r.json())
      .then((d: { ok: boolean; verdict?: string; confidence?: number; ai_decision?: string }) => {
        setAiData((prev) => ({
          ...prev,
          [selectedId]: {
            verdict: d.ok ? ((d.verdict === "relevant" || d.verdict === "not_relevant") ? d.verdict : null) : null,
            confidence: d.ok ? (d.confidence ?? null) : null,
            aiDecision: d.ok ? (d.ai_decision ?? null) : null,
            loading: false,
          },
        }));
        // Also update the article's local specialty_confidence for the badge
        setArticles((prev) =>
          prev.map((a) =>
            a.id === selectedId && a.specialty_confidence == null
              ? { ...a, specialty_confidence: d.confidence ?? null }
              : a
          )
        );
      })
      .catch(() => {
        setAiData((prev) => ({
          ...prev,
          [selectedId]: { verdict: null, confidence: null, aiDecision: null, loading: false },
        }));
      });
  }, [selectedId, specialty]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-select first visible when filter changes ─────────────────────────

  useEffect(() => {
    const visible = applyConfFilter(articles, confidenceFilter);
    if (!visible.some((a) => a.id === selectedId)) {
      setSelectedId(visible[0]?.id ?? null);
    }
  }, [confidenceFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup advance timer on unmount ──────────────────────────────────────

  useEffect(() => {
    return () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); };
  }, []);

  // ── Browser leave warning (tab close / refresh / external nav) ────────────

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!hasUnsavedRef.current) return;
      e.preventDefault();
      e.returnValue = "Du har ureviewede ændringer. Hvis du forlader siden, mistes dit arbejde.";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []); // runs once — reads live value via ref

  // ── Internal navigation warning (capture all <a> clicks) ─────────────────

  useEffect(() => {
    function onLinkClick(e: MouseEvent) {
      if (!hasUnsavedRef.current) return;
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      // Ignore external links, hash-only links, and PubMed links
      if (!href || href.startsWith("http") || href.startsWith("//") || href.startsWith("#")) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
    }
    document.addEventListener("click", onLinkClick, true); // capture phase
    return () => document.removeEventListener("click", onLinkClick, true);
  }, []); // runs once — reads live value via ref

  // ── Back button guard ─────────────────────────────────────────────────────

  useEffect(() => {
    // Push a guard entry so popstate fires before the user actually leaves
    window.history.pushState({ labGuard: true }, "");

    function onPopState() {
      if (hasUnsavedRef.current) {
        // Re-push to stay on page, then show modal
        window.history.pushState({ labGuard: true }, "");
        setPendingHref("__back__");
      }
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []); // runs once

  // ── Drag-to-resize ────────────────────────────────────────────────────────

  const onMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      setPanelWidth(Math.max(280, Math.min(rect.width * 0.6, e.clientX - rect.left)));
    };
    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // ── Verdict toggle + auto-advance ─────────────────────────────────────────

  function handleVerdict(articleId: string, verdict: EditorVerdict) {
    const isDeselect = verdicts[articleId] === verdict;
    setVerdicts((prev) => ({ ...prev, [articleId]: isDeselect ? null : verdict }));

    // Auto-advance only when setting a verdict (not deselecting) and no AI disagreement
    if (!isDeselect) {
      const ai = aiData[articleId];
      const isDisagreement = ai?.verdict != null && ai.verdict !== verdict;

      if (!isDisagreement) {
        const visible = applyConfFilter(articles, confidenceFilter);
        const idx = visible.findIndex((a) => a.id === articleId);
        const nextId = idx < visible.length - 1 ? visible[idx + 1].id : null;

        if (advanceTimer.current) clearTimeout(advanceTimer.current);
        if (nextId) {
          advanceTimer.current = setTimeout(() => setSelectedId(nextId), 400);
        }
      }
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function handleNext() {
    const visible = applyConfFilter(articles, confidenceFilter);
    const idx = visible.findIndex((a) => a.id === selectedId);
    if (idx < visible.length - 1) setSelectedId(visible[idx + 1].id);
  }

  // ── Bekræft & gem ─────────────────────────────────────────────────────────

  async function handleBekræft(navigateTo?: string) {
    const destination = navigateTo ?? "/admin/lab";
    const toSave = articles
      .map((a) => ({
        article_id: a.id,
        verdict: verdicts[a.id] ?? null,
        ai_verdict: aiData[a.id]?.verdict ?? null,
        ai_confidence: aiData[a.id]?.confidence ?? null,
      }))
      .filter((v): v is { article_id: string; verdict: EditorVerdict; ai_verdict: EditorVerdict | null; ai_confidence: number | null } => v.verdict != null)
      .map((v) => {
        const isDisagreement =
          (v.verdict === "not_relevant" && v.ai_verdict === "relevant") ||
          (v.verdict === "relevant" && v.ai_verdict === "not_relevant");
        return {
          article_id: v.article_id,
          verdict: v.verdict === "relevant" ? "approved" : "rejected",
          ai_decision: v.ai_verdict === "relevant" ? "approved" : v.ai_verdict === "not_relevant" ? "rejected" : null,
          ai_confidence: v.ai_confidence,
          disagreement_reason: isDisagreement
            ? (reasons[v.article_id] === "Other" ? (otherText[v.article_id] || null) : (reasons[v.article_id] ?? null))
            : null,
        } as { article_id: string; verdict: "approved" | "rejected"; ai_decision: "approved" | "rejected" | null; ai_confidence: number | null; disagreement_reason: string | null };
      });

    if (toSave.length === 0) return;

    setSaving(true);
    try {
      const res = await fetch("/api/lab/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialty, module: "specialty_tag", verdicts: toSave }),
      });
      const data = await res.json() as { ok: boolean; approved?: number; rejected?: number; error?: string };

      if (data.ok) {
        hasUnsavedRef.current = false; // clear before navigation to suppress beforeunload
        setPendingHref(null);
        setToast(`${data.approved} artikler godkendt, ${data.rejected} afvist`);
        setTimeout(() => {
          router.push(navigateTo === undefined ? "/admin/lab" : destination);
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

  // ── Derived state ─────────────────────────────────────────────────────────

  const visibleArticles  = applyConfFilter(articles, confidenceFilter);
  const currentArticle   = articles.find((a) => a.id === selectedId) ?? null;
  const currentVerdict   = currentArticle ? (verdicts[currentArticle.id] ?? null) : null;
  const currentAI        = currentArticle ? aiData[currentArticle.id] : undefined;
  const reviewedCount    = Object.values(verdicts).filter(Boolean).length;
  const hasAnyVerdict    = reviewedCount > 0;
  hasUnsavedRef.current  = hasAnyVerdict; // keep ref in sync for stable event handlers

  const visibleIdx       = visibleArticles.findIndex((a) => a.id === selectedId);
  const isLastVisible    = visibleIdx >= visibleArticles.length - 1;

  const filterCounts = {
    all:    articles.length,
    high:   articles.filter((a) => a.specialty_confidence != null && a.specialty_confidence >= 70).length,
    medium: articles.filter((a) => a.specialty_confidence != null && a.specialty_confidence >= 40 && a.specialty_confidence < 70).length,
    low:    articles.filter((a) => a.specialty_confidence != null && a.specialty_confidence < 40).length,
  };

  const filterTabs: { key: ConfidenceFilter; label: string }[] = [
    { key: "all",    label: `All (${filterCounts.all})` },
    { key: "high",   label: `70+ (${filterCounts.high})` },
    { key: "medium", label: `40–69 (${filterCounts.medium})` },
    { key: "low",    label: `<40 (${filterCounts.low})` },
  ];

  // ── Loading / empty states ────────────────────────────────────────────────

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
        <div style={{ fontSize: "16px", fontWeight: 600, color: "#1a1a1a" }}>Scorer artikler med AI…</div>
        <div style={{ fontSize: "13px", color: "#888" }}>
          {scoringProgress
            ? `${scoringProgress.scored} / ${scoringProgress.total} artikler scoret…`
            : `Forbereder scoring…`}
        </div>
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f5f7fa", gap: "12px" }}>
        <div style={{ fontSize: "40px" }}>🎉</div>
        <div style={{ fontSize: "18px", fontWeight: 700, color: "#1a1a1a" }}>No unverified articles</div>
        <div style={{ fontSize: "14px", color: "#888" }}>All Circle 2 articles for {label} have been reviewed.</div>
        <button onClick={() => router.push("/admin/lab")} style={{ marginTop: "12px", borderRadius: "8px", padding: "10px 20px", background: "#1a1a1a", color: "#fff", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
          ← Back to The Lab
        </button>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Top header */}
      <header style={{ height: "56px", background: "#EEF2F7", borderBottom: "1px solid #dde3ed", display: "flex", alignItems: "center", padding: "0 32px", flexShrink: 0 }}>
        <span style={{ fontWeight: 800, fontSize: "18px", letterSpacing: "0.06em" }}>
          PULSE<span style={{ color: "#E83B2A" }}>FEED</span>
        </span>
        <div style={{ fontSize: "13px", color: "#5a6a85", marginLeft: "20px", paddingLeft: "20px", borderLeft: "1px solid #dde3ed", display: "flex", alignItems: "center", gap: "12px" }}>
          <a href="/admin/lab" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>← The Lab</a>
          <span style={{ color: "#dde3ed" }}>·</span>
          <span>Training · {label}</span>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a", background: "#fff", border: "1px solid #dde3ed", borderRadius: "20px", padding: "4px 14px" }}>
            <span style={{ color: "#E83B2A" }}>{reviewedCount}</span>{" "}of {totalCount} reviewed
          </div>
        </div>
      </header>

      {/* Split layout */}
      <div ref={splitRef} style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

        {/* LEFT PANEL */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, background: "#fff", width: `${panelWidth}px`, minWidth: "280px", maxWidth: "60%", flexShrink: 0, borderRight: "1px solid #e8ecf1" }}>

          {/* Confidence filter bar */}
          <div style={{ padding: "8px 12px", borderBottom: "1px solid #eee", background: "#fafbfc", flexShrink: 0, display: "flex", gap: "4px" }}>
            {filterTabs.map(({ key, label: tabLabel }) => {
              const isActive = confidenceFilter === key;
              return (
                <button key={key} onClick={() => setConfFilter(key)} style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "4px", border: "1px solid", borderColor: isActive ? "#1a1a1a" : "#dde3ed", background: isActive ? "#1a1a1a" : "#fff", color: isActive ? "#fff" : "#5a6a85", cursor: "pointer", fontWeight: isActive ? 700 : 400, whiteSpace: "nowrap" }}>
                  {tabLabel}
                </button>
              );
            })}
          </div>

          {/* Article list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {visibleArticles.length === 0 ? (
              <div style={{ padding: "24px 16px", fontSize: "13px", color: "#aaa", textAlign: "center" }}>
                No articles in this range
              </div>
            ) : (
              visibleArticles.map((article) => {
                const isActive  = article.id === selectedId;
                const verdict   = verdicts[article.id] ?? null;
                const borderClr = isActive
                  ? "#E83B2A"
                  : verdict === "relevant"     ? "#15803d"
                  : verdict === "not_relevant" ? "#b91c1c"
                  : "transparent";
                return (
                  <div
                    key={article.id}
                    onClick={() => setSelectedId(article.id)}
                    style={{ padding: "12px 16px", borderBottom: "1px solid #f5f5f5", cursor: "pointer", background: isActive ? "#fff8f7" : "#fff", borderLeft: `3px solid ${borderClr}`, transition: "background 0.1s" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
                      <div style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.03em", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {[article.journal_abbr, formatShortDate(article.published_date)].filter(Boolean).join(" · ")}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                        {verdict === "relevant"     && <span style={{ fontSize: "10px", fontWeight: 700, color: "#15803d" }}>✓</span>}
                        {verdict === "not_relevant" && <span style={{ fontSize: "10px", fontWeight: 700, color: "#b91c1c" }}>✗</span>}
                        <CircleBadge circle={article.circle} />
                        <ConfidenceBadge score={article.specialty_confidence} aiDecision={article.ai_decision} />
                      </div>
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: 600, lineHeight: 1.4, color: "#1a1a1a", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {article.title}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Drag handle */}
        <div onMouseDown={onMouseDown} style={{ width: "5px", background: "#dde3ed", cursor: "col-resize", flexShrink: 0 }} />

        {/* RIGHT PANEL */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: "320px" }}>
          {!currentArticle ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: "14px" }}>
              {visibleArticles.length === 0 ? "No articles match this filter" : "Select an article to begin"}
            </div>
          ) : (
            <>
              {/* ── Article topbar ─────────────────────────────────────────────── */}
              <div style={{ flexShrink: 0, background: "#fafbfc", borderBottom: "1px solid #eee", padding: "10px 32px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#E83B2A", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {label}
                </span>
                {currentArticle.journal_abbr && (
                  <>
                    <span style={{ color: "#dde3ed", fontSize: "14px" }}>·</span>
                    <span style={{ fontSize: "13px", color: "#5a6a85" }}>{currentArticle.journal_abbr}</span>
                  </>
                )}
                <div style={{ flex: 1 }} />
                <AITopbarBadge ai={currentAI} />
              </div>

              {/* ── Scrollable article content ─────────────────────────────────── */}
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 32px 20px", background: "#fff" }}>
                <div style={{ fontSize: "20px", fontWeight: 700, lineHeight: 1.4, marginBottom: "8px" }}>
                  {currentArticle.title}
                </div>
                <div style={{ fontSize: "13px", color: "#888", marginBottom: "24px" }}>
                  {formatDate(currentArticle.published_date)}
                  {firstAuthor(currentArticle.authors) && ` · ${firstAuthor(currentArticle.authors)}`}
                  {" · "}
                  <a href={`https://pubmed.ncbi.nlm.nih.gov/${currentArticle.pubmed_id}/`} target="_blank" rel="noopener noreferrer" style={{ color: "#1a6eb5", textDecoration: "none" }}>
                    PMID {currentArticle.pubmed_id} ↗
                  </a>
                </div>
                {currentArticle.abstract && (
                  <>
                    <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "8px" }}>
                      Abstract
                    </div>
                    <div style={{ fontSize: "14px", lineHeight: 1.8, color: "#2a2a2a" }}>
                      {renderAbstract(currentArticle.abstract)}
                    </div>
                  </>
                )}
              </div>

              {/* ── Sticky action bar ──────────────────────────────────────────── */}
              <div style={{ flexShrink: 0, background: "#fff", borderTop: "2px solid #e2e8f0", padding: "14px 24px", display: "flex", alignItems: "center", gap: "8px" }}>

                {/* Verdict buttons */}
                {([
                  { v: "relevant"     as EditorVerdict, btnLabel: `✓ ${label}`,                  selBg: "#15803d", idleColor: "#15803d", idleBorder: "#bbf7d0" },
                  { v: "not_relevant" as EditorVerdict, btnLabel: `✗ Not ${label.toLowerCase()}`, selBg: "#b91c1c", idleColor: "#b91c1c", idleBorder: "#fecaca" },
                ]).map(({ v, btnLabel, selBg, idleColor, idleBorder }) => {
                  const isSelected = currentVerdict === v;
                  return (
                    <button
                      key={v}
                      onClick={() => handleVerdict(currentArticle.id, v)}
                      style={{
                        borderRadius: "8px",
                        padding: "9px 16px",
                        fontSize: "13px",
                        fontWeight: 600,
                        background: isSelected ? selBg : "#fff",
                        border: `1px solid ${isSelected ? selBg : idleBorder}`,
                        color: isSelected ? "#fff" : idleColor,
                        cursor: "pointer",
                        transition: "all 0.12s",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {btnLabel}
                    </button>
                  );
                })}

                {/* Disagreement reason — shown when editor overrules AI (both directions) */}
                {(() => {
                  const isFalsePositive = currentVerdict === "not_relevant" && currentAI?.verdict === "relevant";
                  const isFalseNegative = currentVerdict === "relevant" && currentAI?.verdict === "not_relevant";
                  if (!isFalsePositive && !isFalseNegative) return null;

                  const options = isFalsePositive
                    ? [
                        "Neuroscience",
                        "Basic neuro research",
                        "Neurology",
                        "Oncology",
                        "Anesthesiology",
                        "ENT",
                        "Radiology",
                        "Ophthalmology",
                        "Psychiatry",
                        "Nuclear Medicine",
                        "Health Care Management",
                        "Ikke klinisk relevant",
                        "Other",
                      ]
                    : [
                        "Klinisk relevant trods lav AI-score",
                        "Ny behandlingsmetode / intervention",
                        "Ændrer klinisk praksis",
                        "Vigtig sikkerhedsdata",
                        "Sjælden tilstand / specialiseret emne",
                        "Andet",
                      ];

                  const selectedReason = reasons[currentArticle.id] ?? "";

                  return (
                    <>
                      <select
                        value={selectedReason}
                        onChange={(e) => setReasons((prev) => ({ ...prev, [currentArticle.id]: e.target.value }))}
                        style={{
                          fontSize: "12px",
                          padding: "7px 10px",
                          borderRadius: "8px",
                          border: "1px solid #fecaca",
                          background: "#fff8f7",
                          color: selectedReason ? "#1a1a1a" : "#b91c1c",
                          cursor: "pointer",
                          outline: "none",
                          minWidth: "180px",
                        }}
                      >
                        <option value="">Vælg årsag…</option>
                        {options.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                      {selectedReason === "Other" && (
                        <input
                          type="text"
                          placeholder="Beskriv årsag…"
                          value={otherText[currentArticle.id] ?? ""}
                          onChange={(e) => setOtherText((prev) => ({ ...prev, [currentArticle.id]: e.target.value }))}
                          style={{
                            fontSize: "12px",
                            padding: "7px 10px",
                            borderRadius: "8px",
                            border: "1px solid #fecaca",
                            background: "#fff8f7",
                            color: "#1a1a1a",
                            outline: "none",
                            minWidth: "180px",
                          }}
                        />
                      )}
                    </>
                  );
                })()}

                <div style={{ flex: 1 }} />

                {/* Next article — ghost style */}
                <button
                  onClick={handleNext}
                  disabled={isLastVisible}
                  style={{
                    borderRadius: "8px",
                    padding: "9px 16px",
                    fontSize: "13px",
                    fontWeight: 500,
                    background: "transparent",
                    border: "1px solid #dde3ed",
                    color: "#5a6a85",
                    cursor: isLastVisible ? "default" : "pointer",
                    opacity: isLastVisible ? 0.4 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  Next article →
                </button>

                {/* Bekræft & gem — primary */}
                <button
                  onClick={() => void handleBekræft()}
                  disabled={!hasAnyVerdict || saving}
                  style={{
                    borderRadius: "8px",
                    padding: "9px 22px",
                    fontSize: "13px",
                    fontWeight: 700,
                    background: hasAnyVerdict && !saving ? "#E83B2A" : "#e2e8f0",
                    border: "none",
                    color: hasAnyVerdict && !saving ? "#fff" : "#94a3b8",
                    cursor: hasAnyVerdict && !saving ? "pointer" : "not-allowed",
                    transition: "all 0.15s",
                    whiteSpace: "nowrap",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {saving ? <><Spinner size={12} /> Gemmer…</> : <>Bekræft & gem{reviewedCount > 0 && <span style={{ fontSize: "11px", fontWeight: 600, background: "rgba(255,255,255,0.25)", borderRadius: "999px", padding: "1px 7px", marginLeft: "4px" }}>{reviewedCount}</span>}</>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer: progress bar only */}
      <div style={{ height: "40px", background: "#fafbfc", borderTop: "1px solid #eee", display: "flex", alignItems: "center", padding: "0 32px", gap: "12px", flexShrink: 0 }}>
        <span style={{ fontSize: "12px", color: "#888" }}>
          <strong style={{ color: "#1a1a1a" }}>{reviewedCount}</strong> of {totalCount} reviewed
        </span>
        <div style={{ width: "120px", height: "3px", background: "#e2e8f0", borderRadius: "2px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${totalCount > 0 ? Math.round((reviewedCount / totalCount) * 100) : 0}%`, background: "#E83B2A", borderRadius: "2px", transition: "width 0.3s" }} />
        </div>
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
                onClick={() => void handleBekræft(pendingHref === "__back__" ? undefined : pendingHref)}
                disabled={saving}
                style={{ flex: "1 1 auto", padding: "9px 14px", borderRadius: "8px", border: "none", background: "#E83B2A", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
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
