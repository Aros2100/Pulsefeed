"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import SaveButton from "@/components/SaveButton";
import ArticleGeoFilter from "@/components/articles/ArticleGeoFilter";

interface Article {
  id: string;
  title: string;
  journal_abbr: string | null;
  published_date: string | null;
  authors: unknown;
  publication_types: string[] | null;
  enriched_at: string | null;
  indexed_date: string | null;
  imported_at: string;
}

interface Project { id: string; name: string }

interface GeoMap {
  regions:            string[];
  regionToCountries:  Record<string, string[]>;
  countryToCities:    Record<string, string[]>;
  cityToInstitutions: Record<string, string[]>;
}

interface Props {
  articles:            Article[];
  specialtyLabel:      string;
  savedMap:            Record<string, string | null>;
  projects:            Project[];
  activePeriod:        string | null;
  activeSubspecialty:  string | null;
  subspecialtyOptions: string[];
  geoMap:              GeoMap;
  userHospital:        string | null;
  currentPage:         number;
  totalPages:          number;
  totalCount:          number;
  activeMeshTerms?:    string[];
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  } catch {
    return "";
  }
}

function firstAuthor(authors: unknown): string {
  if (!Array.isArray(authors) || authors.length === 0) return "";
  const a = authors[0] as { foreName?: string; lastName?: string };
  const name = [a.foreName, a.lastName].filter(Boolean).join(" ");
  return authors.length > 1 ? `${name} et al.` : name;
}

const selectStyle: React.CSSProperties = {
  border: "1px solid #dde3ed",
  borderRadius: "6px",
  padding: "6px 10px",
  fontSize: "12px",
  color: "#1a1a1a",
  background: "#fff",
  outline: "none",
  cursor: "pointer",
  maxWidth: "200px",
};

const PERIOD_BUTTONS = [
  { value: "uge",   label: "This week" },
  { value: "måned", label: "Month" },
  { value: "år",    label: "Year" },
  { value: "alle",  label: "All" },
];

export default function ArticleListClient({
  articles,
  specialtyLabel,
  savedMap,
  projects,
  activePeriod,
  activeSubspecialty,
  subspecialtyOptions,
  geoMap,
  userHospital,
  currentPage,
  totalPages,
  totalCount,
  activeMeshTerms,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [displayedArticles, setDisplayedArticles] = useState<Article[]>(articles);
  const [loadedUpTo, setLoadedUpTo] = useState(currentPage);
  const [isLoading, setIsLoading] = useState(false);
  const [inputPage, setInputPage] = useState(String(currentPage));
  const isRestoredRef = useRef(false);

  // Restore snapshot when returning via browser back
  useEffect(() => {
    const raw = sessionStorage.getItem("articleList_snapshot");
    if (!raw) return;
    try {
      const snapshot = JSON.parse(raw) as {
        displayedArticles: Article[];
        loadedUpTo: number;
        scrollY: number;
        paramsKey: string;
      };
      // Discard if filters have changed
      if (snapshot.paramsKey !== window.location.search) {
        sessionStorage.removeItem("articleList_snapshot");
        return;
      }
      isRestoredRef.current = true;
      setDisplayedArticles(snapshot.displayedArticles);
      setLoadedUpTo(snapshot.loadedUpTo);
      requestAnimationFrame(() => { window.scrollTo(0, snapshot.scrollY); });
      sessionStorage.removeItem("articleList_snapshot");
    } catch {
      sessionStorage.removeItem("articleList_snapshot");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset state when server sends new data (filter change or page navigation)
  useEffect(() => {
    if (isRestoredRef.current) {
      isRestoredRef.current = false;
      return;
    }
    setDisplayedArticles(articles);
    setLoadedUpTo(currentPage);
    setInputPage(String(currentPage));
  }, [articles, currentPage]);

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    // Filter changes reset to page 1
    if (key !== "page") params.delete("page");
    router.push(`/articles?${params.toString()}`);
  }

  async function loadMore() {
    if (isLoading || loadedUpTo >= totalPages) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", String(loadedUpTo + 1));
      const res = await fetch(`/api/articles/page?${params.toString()}`);
      if (res.ok) {
        const data = await res.json() as { articles: Article[] };
        setDisplayedArticles((prev) => [...prev, ...data.articles]);
        setLoadedUpTo((prev) => prev + 1);
      }
    } finally {
      setIsLoading(false);
    }
  }

  function saveSnapshot() {
    sessionStorage.setItem("articleList_snapshot", JSON.stringify({
      displayedArticles,
      loadedUpTo,
      scrollY: window.scrollY,
      paramsKey: window.location.search,
    }));
  }

  function navigatePage(p: number) {
    setParam("page", p === 1 ? null : String(p));
  }

  function handlePageInputCommit(val: string) {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1 && n <= totalPages) {
      navigatePage(n);
    } else {
      setInputPage(String(currentPage));
    }
  }

  const activePeriodKey = activePeriod ?? "uge";

  const navBtnStyle = (disabled: boolean): React.CSSProperties => ({
    fontSize: "12px",
    padding: "5px 10px",
    borderRadius: "6px",
    border: "1px solid #dde3ed",
    background: disabled ? "#f5f7fa" : "#fff",
    color: disabled ? "#bbb" : "#5a6a85",
    cursor: disabled ? "default" : "pointer",
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", color: "#1a1a1a" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* Page header card */}
        <div style={{
          background: "#fff",
          borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          marginBottom: "12px",
          overflow: "hidden",
        }}>
          <div style={{
            background: "#EEF2F7",
            borderBottom: "1px solid #dde3ed",
            padding: "10px 24px",
          }}>
            <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase" as const, fontWeight: 700 }}>
              {specialtyLabel}
            </div>
          </div>

          <div style={{ padding: "16px 24px" }}>
            <div style={{ fontSize: "20px", fontWeight: 700, marginBottom: "4px" }}>Articles</div>
            <div style={{ fontSize: "13px", color: "#999" }}>
              {totalCount} results
            </div>
          </div>

          {/* Filter bar */}
          <div style={{
            borderTop: "1px solid #f0f0f0",
            padding: "12px 24px",
            display: "flex",
            gap: "16px",
            alignItems: "flex-start",
            flexWrap: "wrap" as const,
          }}>

            {/* Tid + Subspecialer */}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" as const, alignItems: "center" }}>
              <div style={{ display: "flex", gap: "4px" }}>
                {PERIOD_BUTTONS.map((btn) => {
                  const isActive = activePeriodKey === btn.value;
                  return (
                    <button
                      key={btn.value}
                      onClick={() => setParam("period", btn.value === "uge" ? null : btn.value)}
                      style={{
                        fontSize: "12px",
                        padding: "5px 11px",
                        borderRadius: "6px",
                        border: `1px solid ${isActive ? "#1a1a1a" : "#dde3ed"}`,
                        background: isActive ? "#1a1a1a" : "#fff",
                        color: isActive ? "#fff" : "#5a6a85",
                        cursor: "pointer",
                        whiteSpace: "nowrap" as const,
                      }}
                    >
                      {btn.label}
                    </button>
                  );
                })}
              </div>

              <select
                value={activeSubspecialty ?? ""}
                onChange={(e) => setParam("subspecialty", e.target.value || null)}
                style={selectStyle}
              >
                <option value="">All subspecialties</option>
                {subspecialtyOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Geo filter */}
            <ArticleGeoFilter geoMap={geoMap} userHospital={userHospital} />

          </div>

          {/* Active MeSH chips (read-only) */}
          {activeMeshTerms && activeMeshTerms.length > 0 && (
            <div style={{
              borderTop: "1px solid #f0f0f0",
              padding: "10px 24px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap" as const,
            }}>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#94a3b8", whiteSpace: "nowrap" as const }}>
                MeSH:
              </span>
              {activeMeshTerms.map((term) => (
                <span
                  key={term}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "4px 12px",
                    fontSize: "11.5px",
                    fontWeight: 500,
                    color: "#fff",
                    background: "linear-gradient(135deg, #c0392b, #a93226)",
                    borderRadius: "20px",
                    whiteSpace: "nowrap" as const,
                  }}
                >
                  {term}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Articles card */}
        <div style={{
          background: "#fff",
          borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
            <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase" as const, fontWeight: 700 }}>
              Latest articles
            </div>
          </div>

          {displayedArticles.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center" as const, color: "#999", fontSize: "14px" }}>
              No articles match this filter.
            </div>
          ) : (
            displayedArticles.map((article, i) => {
              const isHovered = hoveredId === article.id;
              const author    = firstAuthor(article.authors);
              const date      = formatDate(article.published_date);
              const meta      = [article.journal_abbr, date].filter(Boolean).join(" · ");
              const pubType   = article.publication_types?.[0];
              const isSaved   = article.id in savedMap;
              const savedPid  = savedMap[article.id] ?? null;

              return (
                <div
                  key={article.id}
                  onClick={() => { saveSnapshot(); router.push(`/articles/${article.id}`); }}
                  onMouseEnter={() => setHoveredId(article.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    padding: "16px 24px",
                    borderBottom: i < displayedArticles.length - 1 ? "1px solid #f0f0f0" : undefined,
                    cursor: "pointer",
                    background: isHovered ? "#fafbfc" : undefined,
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "12px",
                    alignItems: "start",
                  }}
                >
                  <div>
                    {meta && (
                      <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "5px", letterSpacing: "0.04em", textTransform: "uppercase" as const }}>
                        {meta}
                      </div>
                    )}
                    <div style={{
                      fontSize: "15px", fontWeight: 600, lineHeight: 1.45,
                      color: isHovered ? "#E83B2A" : "#1a1a1a",
                      transition: "color 0.15s",
                    }}>
                      {article.title}
                    </div>
                    {author && (
                      <div style={{ fontSize: "13px", color: "#888", marginTop: "5px" }}>{author}</div>
                    )}
                    <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" as const }}>
                      {pubType && (
                        <span style={{ fontSize: "11px", background: "#fff", border: "1px solid #ddd", borderRadius: "4px", padding: "2px 8px", color: "#555" }}>
                          {pubType}
                        </span>
                      )}
                      {article.enriched_at && (
                        <span style={{ fontSize: "11px", background: "#f0f7ee", border: "1px solid #c8e6c0", borderRadius: "4px", padding: "2px 8px", color: "#3a7d44" }}>
                          AI enriched
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: "8px", paddingTop: "2px" }}>
                    <div onClick={(e) => e.stopPropagation()}>
                      <SaveButton
                        articleId={article.id}
                        initialSaved={isSaved}
                        initialProjectId={savedPid}
                        projects={projects}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: "6px" }}>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Vis flere button */}
          {loadedUpTo < totalPages && (
            <div style={{ padding: "16px 24px", borderTop: "1px solid #f0f0f0", textAlign: "center" as const }}>
              <button
                onClick={loadMore}
                disabled={isLoading}
                style={{
                  fontSize: "13px",
                  padding: "8px 20px",
                  borderRadius: "6px",
                  border: "1px solid #dde3ed",
                  background: isLoading ? "#f5f7fa" : "#fff",
                  color: isLoading ? "#aaa" : "#1a1a1a",
                  cursor: isLoading ? "default" : "pointer",
                }}
              >
                {isLoading ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </div>

        {/* Pagination bar */}
        {totalPages > 1 && (
          <div style={{
            marginTop: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            flexWrap: "wrap" as const,
          }}>
            <button
              onClick={() => navigatePage(1)}
              disabled={currentPage === 1}
              style={navBtnStyle(currentPage === 1)}
            >
              &laquo; First
            </button>
            <button
              onClick={() => navigatePage(currentPage - 1)}
              disabled={currentPage === 1}
              style={navBtnStyle(currentPage === 1)}
            >
              &lsaquo; Previous
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#5a6a85" }}>
              <span>Page</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={inputPage}
                onChange={(e) => setInputPage(e.target.value)}
                onBlur={(e) => handlePageInputCommit(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handlePageInputCommit(inputPage); }}
                style={{
                  width: "52px",
                  padding: "4px 6px",
                  fontSize: "13px",
                  border: "1px solid #dde3ed",
                  borderRadius: "6px",
                  textAlign: "center" as const,
                  outline: "none",
                }}
              />
              <span>of {totalPages}</span>
            </div>

            <button
              onClick={() => navigatePage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              style={navBtnStyle(currentPage >= totalPages)}
            >
              Next &rsaquo;
            </button>
            <button
              onClick={() => navigatePage(totalPages)}
              disabled={currentPage >= totalPages}
              style={navBtnStyle(currentPage >= totalPages)}
            >
              Last &raquo;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
