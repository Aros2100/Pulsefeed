"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

interface Author { foreName?: string; lastName?: string }
interface PicoData { population?: string; intervention?: string; comparison?: string; outcome?: string }

export interface NLArticle {
  id: string;
  title: string;
  journal_abbr: string | null;
  published_date: string | null;
  authors: unknown;
  article_type: string | null;
  news_value: number | null;
  clinical_relevance: string | null;
  enriched_at: string | null;
  short_resume: string | null;
  abstract: string | null;
  pico: unknown;
  pubmed_id: string;
  volume: string | null;
  issue: string | null;
  imported_at: string;
}

interface Props {
  articles: NLArticle[];
  specialtyLabel: string;
  weekNumber: number;
}

type RelevanceFilter = "all" | "practice" | "clinical" | "research";
type SortBy = "news_value" | "newest";

function stars(value: number | null): string {
  if (!value) return "";
  const v = Math.round(Math.max(1, Math.min(5, value)));
  return "★".repeat(v) + "☆".repeat(5 - v);
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch { return ""; }
}

function formatFullDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return ""; }
}

function firstAuthor(authors: unknown): string {
  if (!Array.isArray(authors) || authors.length === 0) return "";
  const a = authors[0] as Author;
  const name = [a.foreName, a.lastName].filter(Boolean).join(" ");
  return authors.length > 1 ? `${name} et al.` : name;
}

function relevanceInfo(cr: string | null) {
  if (!cr) return null;
  const lower = cr.toLowerCase();
  if (lower.includes("practice")) return { label: "Practice changing", bg: "#fff3e0", color: "#e65100", key: "practice" };
  if (lower.includes("clinical")) return { label: "Clinically relevant", bg: "#e8f4e8", color: "#2d7a2d", key: "clinical" };
  return { label: "Research only", bg: "#f0f0f0", color: "#666", key: "research" };
}

function filterAndSort(
  articles: NLArticle[],
  filter: RelevanceFilter,
  sort: SortBy,
  articleTypeFilter: string,
): NLArticle[] {
  let result = [...articles];
  if (filter !== "all") {
    result = result.filter((a) => {
      const info = relevanceInfo(a.clinical_relevance);
      return info?.key === filter;
    });
  }
  if (articleTypeFilter !== "all") {
    result = result.filter((a) => a.article_type === articleTypeFilter);
  }
  if (sort === "news_value") {
    result.sort((a, b) => (b.news_value ?? 0) - (a.news_value ?? 0));
  } else {
    result.sort((a, b) => new Date(b.imported_at).getTime() - new Date(a.imported_at).getTime());
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = ReturnType<typeof createClient>;

async function saveFeedback(
  supabase: SupabaseClient,
  article: NLArticle,
  decision: "selected" | "skipped",
  articleRank: number,
  weekNumber: number,
) {
  const { error } = await (supabase as any)
    .from("newsletter_feedback")
    .insert({
      article_id: article.id,
      week_number: weekNumber,
      year: new Date().getFullYear(),
      decision,
      article_rank: articleRank,
      news_value: article.news_value,
      clinical_relevance: article.clinical_relevance,
      article_type: article.article_type ?? null,
      impact_factor: null,
    });
  if (error) console.error("newsletter_feedback insert failed:", error.message);

  void (supabase as any)
    .from("article_events")
    .insert({
      article_id: article.id,
      event_type: "feedback",
      payload: {
        week:               weekNumber,
        year:               new Date().getFullYear(),
        news_value:         article.news_value,
        clinical_relevance: article.clinical_relevance,
        decision,
      },
    });
}

export default function NewsletterSelectClient({ articles, specialtyLabel, weekNumber }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(articles[0]?.id ?? null);
  const [filter, setFilter] = useState<RelevanceFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [articleTypeFilter, setArticleTypeFilter] = useState<string>("all");
  const [panelWidth, setPanelWidth] = useState(420);
  const isDragging = useRef(false);
  const splitRef = useRef<HTMLDivElement>(null);

  const articleTypes = useMemo(() => {
    const types = new Set(articles.map((a) => a.article_type).filter(Boolean) as string[]);
    return Array.from(types).sort();
  }, [articles]);

  const filteredArticles = filterAndSort(articles, filter, sortBy, articleTypeFilter);
  const selectedArticles = articles.filter((a) => selectedIds.has(a.id));
  const remainingArticles = filteredArticles.filter((a) => !selectedIds.has(a.id));

  const activeArticle = articles.find((a) => a.id === activeId) ?? null;

  // Drag handler
  const onMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      const newWidth = Math.max(280, Math.min(rect.width * 0.65, e.clientX - rect.left));
      setPanelWidth(newWidth);
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

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const addActive = () => {
    if (!activeId) return;
    const article = articles.find((a) => a.id === activeId);
    if (article) {
      const rank = articles.indexOf(article) + 1;
      saveFeedback(supabase, article, "selected", rank, weekNumber);
    }
    setSelectedIds((prev) => new Set([...prev, activeId]));
    // Move to next unreviewed
    const idx = remainingArticles.findIndex((a) => a.id === activeId);
    const next = remainingArticles[idx + 1] ?? remainingArticles[0];
    if (next && next.id !== activeId) setActiveId(next.id);
  };

  const skipActive = () => {
    if (activeId) {
      const article = articles.find((a) => a.id === activeId);
      if (article) {
        const rank = articles.indexOf(article) + 1;
        saveFeedback(supabase, article, "skipped", rank, weekNumber);
      }
    }
    const idx = remainingArticles.findIndex((a) => a.id === activeId);
    const next = remainingArticles[idx + 1] ?? remainingArticles[idx - 1];
    if (next) setActiveId(next.id);
  };

  const pico = activeArticle?.pico as PicoData | null;
  const pubmedUrl = activeArticle ? `https://pubmed.ncbi.nlm.nih.gov/${activeArticle.pubmed_id}/` : "#";

  // Abstract sections
  const abstractSections = activeArticle?.abstract
    ? activeArticle.abstract.split(/\n/).reduce<{ label: string; text: string }[]>((acc, line) => {
        const match = line.match(/^([A-Z][A-Z /]+):?\s+(.+)/);
        if (match) {
          acc.push({ label: match[1], text: match[2] });
        } else if (acc.length > 0) {
          acc[acc.length - 1].text += " " + line;
        } else {
          acc.push({ label: "", text: line });
        }
        return acc;
      }, [])
    : null;

  const relevanceFilters: { key: RelevanceFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "practice", label: "Practice changing" },
    { key: "clinical", label: "Clinically relevant" },
    { key: "research", label: "Research only" },
  ];
  const sortFilters: { key: SortBy; label: string }[] = [
    { key: "news_value", label: "News value ↓" },
    { key: "newest", label: "Newest" },
  ];

  const selectedCount = selectedIds.size;

  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#f5f7fa",
      color: "#1a1a1a",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header */}
      <header style={{
        height: "72px",
        background: "#EEF2F7",
        borderBottom: "1px solid #dde3ed",
        display: "flex",
        alignItems: "center",
        padding: "0 32px",
        flexShrink: 0,
      }}>
        <img src="/logo-horizontal.svg" alt="PulseFeed" style={{ height: "29px", display: "block" }} />
        <div style={{
          fontSize: "14px", color: "#5a6a85",
          marginLeft: "24px", paddingLeft: "24px",
          borderLeft: "1px solid #dde3ed",
          display: "flex", alignItems: "center", gap: "12px",
        }}>
          <a href="/admin" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Admin
          </a>
          <span style={{ color: "#dde3ed" }}>·</span>
          <span>Select articles · Week {weekNumber} · {specialtyLabel}</span>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <div style={{
            fontSize: "13px", fontWeight: 600, color: "#1a1a1a",
            background: "#EEF2F7", border: "1px solid #dde3ed",
            borderRadius: "20px", padding: "4px 14px",
          }}>
            <span style={{ color: "#E83B2A" }}>{selectedCount}</span> selected
          </div>
        </div>
      </header>

      {/* Split layout */}
      <div ref={splitRef} style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* LEFT PANEL */}
        <div style={{
          display: "flex", flexDirection: "column", overflow: "hidden",
          background: "#fff", width: `${panelWidth}px`,
          minWidth: "280px", maxWidth: "65%", flexShrink: 0,
        }}>
          {/* Filters */}
          <div style={{
            padding: "12px 16px", borderBottom: "1px solid #eee",
            background: "#fafbfc", display: "flex", flexDirection: "column",
            gap: "8px", flexShrink: 0,
          }}>
            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, minWidth: "60px" }}>
                Relevance
              </span>
              {relevanceFilters.map((f) => (
                <button key={f.key} onClick={() => setFilter(f.key)} style={{
                  fontSize: "12px",
                  background: filter === f.key ? "#1a1a1a" : "#fff",
                  border: `1px solid ${filter === f.key ? "#1a1a1a" : "#dde3ed"}`,
                  borderRadius: "20px", padding: "4px 12px",
                  color: filter === f.key ? "#fff" : "#5a6a85",
                  cursor: "pointer", whiteSpace: "nowrap",
                }}>
                  {f.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, minWidth: "60px" }}>
                Sort by
              </span>
              {sortFilters.map((f) => (
                <button key={f.key} onClick={() => setSortBy(f.key)} style={{
                  fontSize: "12px",
                  background: sortBy === f.key ? "#1a1a1a" : "#fff",
                  border: `1px solid ${sortBy === f.key ? "#1a1a1a" : "#dde3ed"}`,
                  borderRadius: "20px", padding: "4px 12px",
                  color: sortBy === f.key ? "#fff" : "#5a6a85",
                  cursor: "pointer", whiteSpace: "nowrap",
                }}>
                  {f.label}
                </button>
              ))}
            </div>
            {articleTypes.length > 0 && (
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <span style={{ fontSize: "11px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, minWidth: "60px" }}>
                  Type
                </span>
                <select
                  value={articleTypeFilter}
                  onChange={(e) => setArticleTypeFilter(e.target.value)}
                  style={{
                    fontSize: "12px", color: "#5a6a85",
                    background: "#fff", border: "1px solid #dde3ed",
                    borderRadius: "20px", padding: "4px 10px",
                    cursor: "pointer", fontFamily: "inherit",
                    appearance: "none", WebkitAppearance: "none",
                  }}
                >
                  <option value="all">All types</option>
                  {articleTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Article list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {/* Selected section */}
            {selectedArticles.length > 0 && (
              <>
                <div style={{
                  padding: "6px 16px 4px",
                  fontSize: "10px", color: "#aaa",
                  textTransform: "uppercase", letterSpacing: "0.07em",
                  background: "#fafbfc", borderBottom: "1px solid #f0f0f0",
                }}>
                  Selected · {selectedCount}
                </div>
                {selectedArticles.map((article) => {
                  const rel = relevanceInfo(article.clinical_relevance);
                  return (
                    <div
                      key={article.id}
                      onClick={() => setActiveId(article.id)}
                      style={{
                        padding: "14px 16px",
                        borderBottom: "1px solid #f5f5f5",
                        cursor: "pointer",
                        display: "flex", gap: "12px", alignItems: "flex-start",
                        background: "#fff",
                        borderLeft: "3px solid transparent",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                          {[article.journal_abbr, formatShortDate(article.published_date)].filter(Boolean).join(" · ")}
                        </div>
                        <div style={{ fontSize: "13px", fontWeight: 600, lineHeight: 1.4, color: "#1a1a1a" }}>
                          {article.title}
                        </div>
                        <div style={{ display: "flex", gap: "5px", marginTop: "6px", flexWrap: "wrap" }}>
                          {article.article_type && (
                            <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "10px", fontWeight: 600, background: "#f0f2f5", color: "#5a6a85" }}>
                              {article.article_type}
                            </span>
                          )}
                          {rel && (
                            <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "10px", fontWeight: 600, background: rel.bg, color: rel.color }}>
                              {rel.label}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                        {article.news_value && (
                          <div style={{ fontSize: "11px", color: "#f4a100" }}>{stars(article.news_value)}</div>
                        )}
                        <div
                          onClick={(e) => { e.stopPropagation(); toggleSelected(article.id); }}
                          style={{
                            width: "22px", height: "22px", borderRadius: "50%",
                            border: "2px solid #2d7a2d",
                            background: "#2d7a2d",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "12px", color: "#fff", flexShrink: 0, marginTop: "2px",
                            cursor: "pointer",
                          }}
                        >
                          ✓
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Remaining section */}
            {remainingArticles.length > 0 && (
              <>
                <div style={{
                  padding: "6px 16px 4px",
                  fontSize: "10px", color: "#aaa",
                  textTransform: "uppercase", letterSpacing: "0.07em",
                  background: "#fafbfc",
                  borderBottom: "1px solid #f0f0f0",
                  borderTop: selectedArticles.length > 0 ? "1px solid #eee" : undefined,
                }}>
                  Remaining · {remainingArticles.length} more
                </div>
                {remainingArticles.map((article) => {
                  const rel = relevanceInfo(article.clinical_relevance);
                  const isActive = activeId === article.id;
                  return (
                    <div
                      key={article.id}
                      onClick={() => setActiveId(article.id)}
                      style={{
                        padding: "14px 16px",
                        borderBottom: "1px solid #f5f5f5",
                        cursor: "pointer",
                        display: "flex", gap: "12px", alignItems: "flex-start",
                        background: isActive ? "#fff8f7" : undefined,
                        borderLeft: `3px solid ${isActive ? "#E83B2A" : "transparent"}`,
                        transition: "background 0.1s",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                          {[article.journal_abbr, formatShortDate(article.published_date)].filter(Boolean).join(" · ")}
                        </div>
                        <div style={{ fontSize: "13px", fontWeight: 600, lineHeight: 1.4, color: "#1a1a1a" }}>
                          {article.title}
                        </div>
                        <div style={{ display: "flex", gap: "5px", marginTop: "6px", flexWrap: "wrap" }}>
                          {article.article_type && (
                            <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "10px", fontWeight: 600, background: "#f0f2f5", color: "#5a6a85" }}>
                              {article.article_type}
                            </span>
                          )}
                          {rel && (
                            <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "10px", fontWeight: 600, background: rel.bg, color: rel.color }}>
                              {rel.label}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                        {article.news_value && (
                          <div style={{ fontSize: "11px", color: "#f4a100" }}>{stars(article.news_value)}</div>
                        )}
                        <div
                          onClick={(e) => { e.stopPropagation(); toggleSelected(article.id); }}
                          style={{
                            width: "22px", height: "22px", borderRadius: "50%",
                            border: "2px solid #dde3ed",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "12px", color: "#888", flexShrink: 0, marginTop: "2px",
                            cursor: "pointer",
                          }}
                        >
                          +
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={onMouseDown}
          style={{
            width: "5px", background: "#dde3ed", cursor: "col-resize",
            flexShrink: 0, position: "relative", transition: "background 0.15s",
          }}
        />

        {/* RIGHT PANEL */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1, minWidth: "280px" }}>
          {activeArticle ? (
            <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
              <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "10px" }}>
                {specialtyLabel}{activeArticle.journal_abbr ? ` · ${activeArticle.journal_abbr}` : ""}
              </div>
              <div style={{ fontSize: "20px", fontWeight: 700, lineHeight: 1.4, marginBottom: "8px" }}>
                {activeArticle.title}
              </div>
              <div style={{ fontSize: "13px", color: "#888", marginBottom: "24px" }}>
                {formatFullDate(activeArticle.published_date)}
                {firstAuthor(activeArticle.authors) && ` · ${firstAuthor(activeArticle.authors)}`}
                {" · "}
                <a href={pubmedUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1a6eb5", textDecoration: "none" }}>
                  PMID {activeArticle.pubmed_id} ↗
                </a>
              </div>

              {/* AI Summary */}
              {activeArticle.short_resume && (
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "8px" }}>
                    AI Summary
                  </div>
                  <div style={{
                    background: "#f0f7ee", border: "1px solid #c8e6c0",
                    borderRadius: "8px", padding: "14px 16px",
                    fontSize: "14px", lineHeight: 1.7, color: "#1a1a1a",
                  }}>
                    {activeArticle.short_resume}
                    <div style={{ display: "flex", gap: "24px", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #c8e6c0" }}>
                      <div>
                        <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>News Value</div>
                        <div style={{ fontSize: "16px", color: "#f4a100" }}>{stars(activeArticle.news_value)}</div>
                      </div>
                      {activeArticle.clinical_relevance && (() => {
                        const rel = relevanceInfo(activeArticle.clinical_relevance);
                        return rel ? (
                          <div>
                            <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Clinical Relevance</div>
                            <span style={{ display: "inline-block", fontSize: "12px", background: rel.bg, color: rel.color, padding: "3px 10px", borderRadius: "10px", fontWeight: 600 }}>
                              {rel.label}
                            </span>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* Facts */}
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "8px" }}>
                  Facts
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "6px 12px", fontSize: "13px" }}>
                  {activeArticle.journal_abbr && <><span style={{ color: "#888" }}>Journal</span><span>{activeArticle.journal_abbr}</span></>}
                  {activeArticle.published_date && <><span style={{ color: "#888" }}>Published</span><span>{formatFullDate(activeArticle.published_date)}</span></>}
                  {activeArticle.volume && <><span style={{ color: "#888" }}>Volume / Issue</span><span>{activeArticle.volume}{activeArticle.issue ? ` / ${activeArticle.issue}` : ""}</span></>}
                  {activeArticle.article_type && <><span style={{ color: "#888" }}>Article type</span><span>{activeArticle.article_type}</span></>}
                  <span style={{ color: "#888" }}>PubMed</span>
                  <span><a href={pubmedUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1a6eb5", textDecoration: "none" }}>PMID {activeArticle.pubmed_id} ↗</a></span>
                </div>
              </div>

              {/* PICO */}
              {pico && (pico.population || pico.intervention || pico.comparison || pico.outcome) && (
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "8px" }}>
                    PICO
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "6px 12px", fontSize: "13px" }}>
                    {pico.population    && <><span style={{ color: "#888" }}>Population</span><span>{pico.population}</span></>}
                    {pico.intervention  && <><span style={{ color: "#888" }}>Intervention</span><span>{pico.intervention}</span></>}
                    {pico.comparison    && <><span style={{ color: "#888" }}>Comparison</span><span>{pico.comparison}</span></>}
                    {pico.outcome       && <><span style={{ color: "#888" }}>Outcome</span><span>{pico.outcome}</span></>}
                  </div>
                </div>
              )}

              {/* Abstract */}
              {activeArticle.abstract && (
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "8px" }}>
                    Abstract
                  </div>
                  <div style={{ fontSize: "14px", lineHeight: 1.8, color: "#2a2a2a" }}>
                    {abstractSections && abstractSections.some((s) => s.label) ? (
                      abstractSections.map((s, i) => (
                        <div key={i} style={{ marginBottom: i < abstractSections.length - 1 ? "14px" : 0 }}>
                          {s.label && (
                            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#5a6a85", display: "block", marginBottom: "3px" }}>
                              {s.label}
                            </span>
                          )}
                          {s.text}
                        </div>
                      ))
                    ) : (
                      activeArticle.abstract
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: "14px" }}>
              Select an article to preview
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{
        height: "68px", background: "#fff", borderTop: "1px solid #dde3ed",
        display: "flex", alignItems: "center", padding: "0 32px", gap: "12px",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "13px", color: "#888" }}>
            <strong style={{ color: "#1a1a1a" }}>{selectedCount}</strong> selected
          </span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "10px" }}>
          <button
            onClick={skipActive}
            style={{
              fontSize: "13px", fontWeight: 600,
              background: "#fff", border: "1px solid #dde3ed",
              color: "#888", borderRadius: "7px", padding: "9px 20px", cursor: "pointer",
            }}
          >
            ✕ Skip article
          </button>
          <button
            onClick={addActive}
            style={{
              fontSize: "13px", fontWeight: 600,
              background: "#2d7a2d", border: "none",
              color: "#fff", borderRadius: "7px", padding: "9px 20px", cursor: "pointer",
            }}
          >
            ✓ Add to newsletter
          </button>
          <div style={{ width: "1px", height: "28px", background: "#eee", margin: "0 4px", alignSelf: "center" }} />
          <button
            disabled={selectedCount === 0}
            style={{
              fontSize: "13px", fontWeight: 600,
              background: "#1a1a1a", border: "none",
              color: "#fff", borderRadius: "7px", padding: "9px 20px",
              cursor: selectedCount > 0 ? "pointer" : "default",
              opacity: selectedCount > 0 ? 1 : 0.4,
            }}
          >
            Preview &amp; send →
          </button>
        </div>
      </div>
    </div>
  );
}
