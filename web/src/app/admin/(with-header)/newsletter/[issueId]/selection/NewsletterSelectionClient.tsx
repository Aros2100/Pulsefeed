"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NLSubspecialty {
  id: string;
  name: string;
  sort_order: number;
}

export interface NLArticle {
  id: string;
  title: string;
  journal_abbr: string | null;
  pubmed_indexed_at: string | null;
  imported_at: string | null;
  authors: unknown;
  news_value: number | null;
  clinical_relevance: string | null;
  short_resume: string | null;
  abstract: string | null;
  pubmed_id: string;
  volume: string | null;
  issue: string | null;
  subspecialty: string[] | null;
  article_type: string | null;
  short_headline: string | null;
  bottom_line: string | null;
  sari_subject: string | null;
  sari_action: string | null;
  sari_result: string | null;
  sari_implication: string | null;
  sample_size: number | null;
}

interface EditionArticle {
  article_id: string;
  subspecialty: string;
  sort_order: number;
}

interface Props {
  edition: { id: string; week_number: number; year: number; status: string };
  subspecialties: NLSubspecialty[];
  articles: NLArticle[];
  existingSelections: EditionArticle[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GENERAL = "No subspecialty";

// ── Helpers ───────────────────────────────────────────────────────────────────

function stars(v: number | null): string {
  if (!v) return "";
  const n = Math.max(1, Math.min(5, Math.round(v)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function fmtDate(s: string | null): string {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return ""; }
}

function fmtShortDate(s: string | null): string {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); }
  catch { return ""; }
}

function firstAuthor(authors: unknown): string {
  if (!Array.isArray(authors) || authors.length === 0) return "";
  const a = authors[0] as { foreName?: string; lastName?: string };
  const name = [a.foreName, a.lastName].filter(Boolean).join(" ");
  return authors.length > 1 ? `${name} et al.` : name;
}

function articleSubspecialties(a: NLArticle): string[] {
  return Array.isArray(a.subspecialty) && a.subspecialty.length > 0 ? a.subspecialty : [];
}


function isoWeeksInYear(year: number): number {
  const jan1 = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const dec31 = new Date(Date.UTC(year, 11, 31)).getUTCDay();
  return jan1 === 4 || dec31 === 4 ? 53 : 52;
}

function prevWeek(week: number, year: number): { week: number; year: number } {
  if (week > 1) return { week: week - 1, year };
  return { week: isoWeeksInYear(year - 1), year: year - 1 };
}

function nextWeek(week: number, year: number): { week: number; year: number } {
  if (week < isoWeeksInYear(year)) return { week: week + 1, year };
  return { week: 1, year: year + 1 };
}

function currentISOWeek(): { week: number; year: number } {
  const d = new Date();
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return {
    week: Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7),
    year: date.getUTCFullYear(),
  };
}

function initSelectedMap(selections: EditionArticle[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const s of selections) {
    if (!map[s.subspecialty]) map[s.subspecialty] = [];
    map[s.subspecialty].push(s.article_id);
  }
  return map;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewsletterSelectionClient({ edition, subspecialties, articles, existingSelections }: Props) {
  const router = useRouter();

  const allSubspecialties = [...subspecialties.map((s) => s.name), GENERAL];

  const [activeSubspecialty, setActiveSubspecialty] = useState<string>(allSubspecialties[0] ?? GENERAL);
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
  const [selectedMap, setSelectedMap] = useState<Record<string, string[]>>(() => initSelectedMap(existingSelections));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [articleTypeFilter, setArticleTypeFilter] = useState<string>("all");

  // Articles for the active subspecialty
  const subspecialtyArticles = useMemo(() => {
    if (activeSubspecialty === GENERAL) {
      return articles.filter((a) => articleSubspecialties(a).length === 0);
    }
    return articles.filter((a) => articleSubspecialties(a).includes(activeSubspecialty));
  }, [articles, activeSubspecialty]);

  const articleTypes = useMemo(() => {
    const types = subspecialtyArticles
      .map((a) => a.article_type)
      .filter((t): t is string => !!t);
    return ["all", ...Array.from(new Set(types)).sort()];
  }, [subspecialtyArticles]);

  const visibleArticles = (articleTypeFilter === "all"
    ? subspecialtyArticles
    : subspecialtyArticles.filter((a) => a.article_type === articleTypeFilter)
  ).sort((a, b) => {
    if (!a.imported_at) return 1;
    if (!b.imported_at) return -1;
    return new Date(b.imported_at).getTime() - new Date(a.imported_at).getTime();
  });

  const selectedForActive: string[] = selectedMap[activeSubspecialty] ?? [];

  const totalSelected = new Set(Object.values(selectedMap).flat()).size;

  const activeArticle = articles.find((a) => a.id === activeArticleId) ?? null;
  const activeIsSelected = activeArticleId
    ? Object.values(selectedMap).some((ids) => ids.includes(activeArticleId))
    : false;

  function countFor(sub: string): { total: number; selected: number } {
    const total = sub === GENERAL
      ? articles.filter((a) => articleSubspecialties(a).length === 0).length
      : articles.filter((a) => articleSubspecialties(a).includes(sub)).length;
    return { total, selected: (selectedMap[sub] ?? []).length };
  }

  async function toggleArticle(articleId: string) {
    const isSelected = (selectedMap[activeSubspecialty] ?? []).includes(articleId);

    // Optimistic update
    setSelectedMap((prev) => {
      const curr = prev[activeSubspecialty] ?? [];
      return {
        ...prev,
        [activeSubspecialty]: isSelected
          ? curr.filter((id) => id !== articleId)
          : [...curr, articleId],
      };
    });

    setError(null);
    setSaving(true);
    try {
      if (isSelected) {
        const res = await fetch("/api/admin/newsletter/selection", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ edition_id: edition.id, article_id: articleId, subspecialty: activeSubspecialty }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      } else {
        const curr = selectedMap[activeSubspecialty] ?? [];
        const res = await fetch("/api/admin/newsletter/selection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ edition_id: edition.id, article_id: articleId, subspecialty: activeSubspecialty, sort_order: curr.length }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      // Revert optimistic update
      setSelectedMap((prev) => {
        const curr = prev[activeSubspecialty] ?? [];
        return {
          ...prev,
          [activeSubspecialty]: isSelected
            ? [...curr, articleId]
            : curr.filter((id) => id !== articleId),
        };
      });
    } finally {
      setSaving(false);
    }
  }

  const today = currentISOWeek();
  const prev = prevWeek(edition.week_number, edition.year);
  const next = nextWeek(edition.week_number, edition.year);
  const isNextFuture = next.year > today.year || (next.year === today.year && next.week > today.week);

  function navigate(w: number, y: number) {
    router.push(`/admin/newsletter?week=${w}&year=${y}`);
  }

  // Abstract section parser
  const abstractSections = activeArticle?.abstract
    ? activeArticle.abstract.split(/\n/).reduce<{ label: string; text: string }[]>((acc, line) => {
        const match = line.match(/^([A-Z][A-Z /]+):?\s+(.+)/);
        if (match) acc.push({ label: match[1], text: match[2] });
        else if (acc.length > 0) acc[acc.length - 1].text += " " + line;
        else acc.push({ label: "", text: line });
        return acc;
      }, [])
    : null;

  const pubmedUrl = activeArticle ? `https://pubmed.ncbi.nlm.nih.gov/${activeArticle.pubmed_id}/` : "#";

  const hasSari = activeArticle && (
    activeArticle.sari_subject || activeArticle.sari_action ||
    activeArticle.sari_result || activeArticle.sari_implication
  );

  return (
    <div style={{
      fontFamily: "var(--font-inter), Inter, sans-serif",
      background: "#f5f7fa", color: "#1a1a1a",
      height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden",
    }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={{
        height: "52px", background: "#fff", borderBottom: "1px solid #dde3ed",
        display: "flex", alignItems: "center", padding: "0 20px", gap: "14px",
        flexShrink: 0, boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}>
        <Link href="/admin" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none", whiteSpace: "nowrap" }}>
          ← Admin
        </Link>
        <span style={{ color: "#dde3ed" }}>·</span>

        {/* Week navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            onClick={() => navigate(prev.week, prev.year)}
            style={{
              fontSize: "14px", background: "none", border: "1px solid #dde3ed",
              borderRadius: "5px", padding: "2px 8px", cursor: "pointer",
              color: "#5a6a85", lineHeight: 1, fontFamily: "inherit",
            }}
            title={`Week ${prev.week} · ${prev.year}`}
          >
            ←
          </button>
          <span style={{ fontSize: "14px", fontWeight: 600, whiteSpace: "nowrap" }}>
            Week {edition.week_number} · {edition.year}
          </span>
          <span style={{ color: "#dde3ed" }}>·</span>
          <span style={{ fontSize: "13px", color: "#5a6a85", whiteSpace: "nowrap" }}>
            {articles.length} articles
          </span>
          <button
            onClick={() => navigate(next.week, next.year)}
            disabled={isNextFuture}
            style={{
              fontSize: "14px", background: "none", border: "1px solid #dde3ed",
              borderRadius: "5px", padding: "2px 8px",
              cursor: isNextFuture ? "default" : "pointer",
              color: isNextFuture ? "#d1d5db" : "#5a6a85",
              borderColor: isNextFuture ? "#f0f0f0" : "#dde3ed",
              lineHeight: 1, fontFamily: "inherit",
            }}
            title={isNextFuture ? "Future week" : `Week ${next.week} · ${next.year}`}
          >
            →
          </button>
        </div>

        {saving && (
          <span style={{ fontSize: "12px", color: "#94a3b8" }}>Saving…</span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "13px", color: "#5a6a85", whiteSpace: "nowrap" }}>
            <strong style={{ color: "#1a1a1a" }}>{totalSelected}</strong> selected
          </span>
          <button
            disabled={totalSelected === 0}
            onClick={() => router.push(`/admin/newsletter/${edition.id}/review`)}
            style={{
              fontSize: "13px", fontWeight: 600, fontFamily: "inherit",
              background: totalSelected > 0 ? "#059669" : "#f3f4f6",
              color: totalSelected > 0 ? "#fff" : "#9ca3af",
              border: "none", borderRadius: "7px", padding: "7px 16px",
              cursor: totalSelected > 0 ? "pointer" : "default",
              whiteSpace: "nowrap",
            }}
          >
            Review →
          </button>
        </div>
      </div>

      {/* ── Error banner ────────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          background: "#fff5f5", borderBottom: "1px solid #fecaca",
          padding: "8px 20px", fontSize: "13px", color: "#b91c1c",
          flexShrink: 0,
        }}>
          {error}
        </div>
      )}

      {/* ── Three-column body ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Col 1: Subspecialty list (200px) */}
        <div style={{ width: "200px", flexShrink: 0, borderRight: "1px solid #dde3ed", background: "#fff", overflowY: "auto" }}>
          <div style={{
            padding: "10px 14px 6px",
            fontSize: "10px", color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700,
          }}>
            Subspecialties
          </div>
          {allSubspecialties.map((sub) => {
            const { total, selected } = countFor(sub);
            const isActive = sub === activeSubspecialty;
            const isGeneral = sub === GENERAL;
            return (
              <div
                key={sub}
                onClick={() => { setActiveSubspecialty(sub); setActiveArticleId(null); setArticleTypeFilter("all"); }}
                style={{
                  padding: "10px 14px",
                  cursor: "pointer",
                  borderLeft: `3px solid ${isActive ? "#E83B2A" : "transparent"}`,
                  background: isActive ? "#fff8f7" : "transparent",
                  borderTop: isGeneral ? "1px solid #f0f0f0" : undefined,
                  marginTop: isGeneral ? "4px" : undefined,
                  transition: "background 0.1s",
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: isActive ? 700 : 500, color: "#1a1a1a", lineHeight: 1.35, marginBottom: "4px" }}>
                  {sub}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "11px", color: "#94a3b8" }}>{total} art.</span>
                  {selected > 0 && (
                    <span style={{
                      fontSize: "10px", fontWeight: 700, color: "#15803d",
                      background: "#f0fdf4", padding: "1px 5px", borderRadius: "8px",
                    }}>
                      {selected}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Col 2: Article list for active subspecialty (260px) */}
        <div style={{ width: "390px", flexShrink: 0, borderRight: "1px solid #dde3ed", background: "#fafbfc", overflowY: "auto" }}>
          <div style={{
            padding: "10px 14px 6px",
            fontSize: "10px", color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700,
            position: "sticky", top: 0, background: "#fafbfc", zIndex: 1,
            borderBottom: "1px solid #f0f0f0",
          }}>
            {visibleArticles.length} article{visibleArticles.length !== 1 ? "s" : ""}
            {articleTypes.length > 1 && (
              <select
                value={articleTypeFilter}
                onChange={(e) => setArticleTypeFilter(e.target.value)}
                style={{
                  fontSize: "11px", border: "1px solid #e2e8f0",
                  borderRadius: "5px", padding: "2px 6px",
                  background: "#fff", color: "#5a6a85",
                  cursor: "pointer", marginLeft: "8px",
                }}
              >
                {articleTypes.map((t) => (
                  <option key={t} value={t}>{t === "all" ? "All types" : t}</option>
                ))}
              </select>
            )}
          </div>
          {visibleArticles.length === 0 ? (
            <div style={{ padding: "24px 14px", fontSize: "13px", color: "#94a3b8" }}>
              No articles this week
            </div>
          ) : visibleArticles.map((article) => {
            const isActive = article.id === activeArticleId;
            const isSelected = selectedForActive.includes(article.id);
            const pubType = article.article_type;

            return (
              <div
                key={article.id}
                onClick={() => setActiveArticleId(article.id)}
                style={{
                  padding: "11px 14px",
                  borderBottom: "1px solid #f0f2f5",
                  cursor: "pointer",
                  borderLeft: `3px solid ${isSelected ? "#15803d" : isActive ? "#E83B2A" : "transparent"}`,
                  background: isSelected ? "#f0fdf4" : isActive ? "#fff8f7" : "transparent",
                  transition: "background 0.1s",
                }}
              >
                <div style={{ fontSize: "10px", color: "#94a3b8", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                  {[article.journal_abbr, fmtShortDate(article.pubmed_indexed_at)].filter(Boolean).join(" · ")}
                </div>
                <div style={{ fontSize: "12px", fontWeight: 600, lineHeight: 1.4, color: "#1a1a1a", marginBottom: "5px" }}>
                  {article.title}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                  {pubType && (
                    <span style={{
                      fontSize: "10px", padding: "1px 6px", borderRadius: "8px",
                      background: "#f0f2f5", color: "#5a6a85", fontWeight: 600,
                    }}>
                      {pubType}
                    </span>
                  )}
                  {article.news_value ? (
                    <span style={{ fontSize: "11px", color: "#f4a100" }}>{stars(article.news_value)}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* Col 3: Article detail (flex) */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", background: "#fff" }}>
          {activeArticle ? (
            <div style={{ padding: "28px 32px", maxWidth: "680px" }}>

              {/* Header */}
              <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "8px" }}>
                {activeArticle.journal_abbr}
              </div>
              <h2 style={{ fontSize: "19px", fontWeight: 700, lineHeight: 1.45, margin: "0 0 8px" }}>
                {activeArticle.title}
              </h2>
              <div style={{ fontSize: "13px", color: "#888", marginBottom: "24px" }}>
                {fmtDate(activeArticle.pubmed_indexed_at)}
                {firstAuthor(activeArticle.authors) ? ` · ${firstAuthor(activeArticle.authors)}` : ""}
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
                    <div style={{ display: "flex", gap: "24px", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #c8e6c0", flexWrap: "wrap" }}>
                      {activeArticle.news_value ? (
                        <div>
                          <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>News Value</div>
                          <div style={{ fontSize: "16px", color: "#f4a100" }}>{stars(activeArticle.news_value)}</div>
                        </div>
                      ) : null}
                      {activeArticle.clinical_relevance && (
                        <div>
                          <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>Clinical Relevance</div>
                          <span style={{ display: "inline-block", fontSize: "12px", background: "#f0f0f0", color: "#555", padding: "2px 8px", borderRadius: "10px", fontWeight: 600 }}>
                            {activeArticle.clinical_relevance}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Facts */}
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "8px" }}>
                  Facts
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "6px 12px", fontSize: "13px" }}>
                  {activeArticle.journal_abbr && <><span style={{ color: "#888" }}>Journal</span><span>{activeArticle.journal_abbr}</span></>}
                  {activeArticle.pubmed_indexed_at && <><span style={{ color: "#888" }}>Indexed</span><span>{fmtDate(activeArticle.pubmed_indexed_at)}</span></>}
                  {activeArticle.volume && <><span style={{ color: "#888" }}>Vol / Issue</span><span>{activeArticle.volume}{activeArticle.issue ? ` / ${activeArticle.issue}` : ""}</span></>}
                  {activeArticle.article_type && <><span style={{ color: "#888" }}>Article type</span><span>{activeArticle.article_type}</span></>}
                  {activeArticle.sample_size ? <><span style={{ color: "#888" }}>Sample size</span><span>{activeArticle.sample_size.toLocaleString("en-GB")}</span></> : null}
                  <span style={{ color: "#888" }}>PubMed</span>
                  <span><a href={pubmedUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1a6eb5", textDecoration: "none" }}>PMID {activeArticle.pubmed_id} ↗</a></span>
                </div>
              </div>

              {/* SARI */}
              {hasSari && (
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "8px" }}>
                    SARI
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "6px 12px", fontSize: "13px" }}>
                    {activeArticle.sari_subject    && <><span style={{ color: "#888" }}>Subject</span><span>{activeArticle.sari_subject}</span></>}
                    {activeArticle.sari_action     && <><span style={{ color: "#888" }}>Action</span><span>{activeArticle.sari_action}</span></>}
                    {activeArticle.sari_result     && <><span style={{ color: "#888" }}>Result</span><span>{activeArticle.sari_result}</span></>}
                    {activeArticle.sari_implication && <><span style={{ color: "#888" }}>Implication</span><span>{activeArticle.sari_implication}</span></>}
                  </div>
                </div>
              )}

              {/* Abstract */}
              {activeArticle.abstract && (
                <div style={{ marginBottom: "24px" }}>
                  <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "8px" }}>
                    Abstract
                  </div>
                  <div style={{ fontSize: "14px", lineHeight: 1.8, color: "#2a2a2a" }}>
                    {abstractSections && abstractSections.some((s) => s.label) ? (
                      abstractSections.map((s, i) => (
                        <div key={i} style={{ marginBottom: i < abstractSections.length - 1 ? "12px" : 0 }}>
                          {s.label && (
                            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#5a6a85", display: "block", marginBottom: "2px" }}>
                              {s.label}
                            </span>
                          )}
                          {s.text}
                        </div>
                      ))
                    ) : activeArticle.abstract}
                  </div>
                </div>
              )}

              {/* Action button */}
              <div style={{ paddingTop: "4px", paddingBottom: "40px" }}>
                <button
                  onClick={() => toggleArticle(activeArticle.id)}
                  style={{
                    width: "100%", fontSize: "14px", fontWeight: 600, fontFamily: "inherit",
                    background: activeIsSelected ? "#f0fdf4" : "#1a1a1a",
                    color: activeIsSelected ? "#15803d" : "#fff",
                    border: activeIsSelected ? "1px solid #bbf7d0" : "1px solid transparent",
                    borderRadius: "8px", padding: "12px 24px",
                    cursor: "pointer",
                  }}
                >
                  {activeIsSelected ? "✓ Remove from newsletter" : "Add to newsletter"}
                </button>
              </div>

            </div>
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "14px" }}>
              Select an article to view details
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
