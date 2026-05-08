"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { EditionArticle, AllModeArticle, SubspecialtyBlock } from "./types";
import { ArticleRowPick } from "./ArticleRowPick";
import { ArticleRowCompact } from "./ArticleRowCompact";
import { ArticleTypeFilter } from "./ArticleTypeFilter";

const PAGE_SIZE = 25;

function getPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

interface Props {
  editionId: string;
  blockKey: string;
  blockLabel: string;
  picksArticles: EditionArticle[];
  allModeTotal: number;
  subspecialties: SubspecialtyBlock[];
  onViewChange?: (view: "picks" | "all") => void;
  initialView?: "picks" | "all";
}

export function EditionDetail({
  editionId,
  blockKey,
  blockLabel,
  picksArticles,
  allModeTotal,
  subspecialties,
  onViewChange,
  initialView = "picks",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isSpecialtyBlock = blockKey === "specialty";
  const subShortNames: Record<string, string> = Object.fromEntries(
    subspecialties.map(s => [s.name, s.short_name ?? s.name])
  );

  const [view, setView] = useState<"picks" | "all">(initialView);
  const [typeFilter, setTypeFilter] = useState("All");
  const [allArticles, setAllArticles] = useState<AllModeArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(() =>
    Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  );

  function updatePageInUrl(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (newPage === 1) {
      params.delete("page");
    } else {
      params.set("page", String(newPage));
    }
    const str = params.toString();
    router.replace(`${pathname}${str ? `?${str}` : ""}`, { scroll: false });
  }

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ editionId, block: blockKey });
      const res = await fetch(`/api/editions/all-articles?${params}`);
      if (res.ok) {
        const json = await res.json();
        setAllArticles(json.articles ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [editionId, blockKey]);

  useEffect(() => {
    if (view === "all" && allArticles.length === 0) {
      void fetchAll();
    }
  }, [view, allArticles.length, fetchAll]);

  function handleViewChange(v: "picks" | "all") {
    setView(v);
    setTypeFilter("All");
    onViewChange?.(v);
  }

  function handleFilterChange(type: string) {
    setTypeFilter(type);
    setPage(1);
    updatePageInUrl(1);
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    updatePageInUrl(newPage);
  }

  const picksCount = picksArticles.length;
  const blockLabelUpper = blockLabel.toUpperCase();

  const filteredAll = typeFilter === "All"
    ? allArticles
    : typeFilter === "Other"
      ? allArticles.filter(a => !a.article_type || !["Meta-analysis","Review","Intervention study","Non-interventional study","Case","Guideline","Surgical Technique","Tech"].includes(a.article_type))
      : allArticles.filter(a => a.article_type === typeFilter);

  const totalPages = Math.ceil(filteredAll.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(1, totalPages));
  const pagedArticles = filteredAll.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const showingFrom = filteredAll.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(safePage * PAGE_SIZE, filteredAll.length);

  const navBtnStyle = (disabled: boolean): React.CSSProperties => ({
    fontSize: "13px", padding: "6px 10px", borderRadius: "6px",
    border: "none", background: "transparent",
    color: disabled ? "#94a3b8" : "#64748b",
    opacity: disabled ? 0.4 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
  });

  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: "#fff",
      border: "0.5px solid #e5e9f0",
      borderRadius: "12px",
      padding: "1.5rem 1.75rem",
    }}>
      {/* Block header */}
      <div style={{
        borderBottom: "0.5px solid #e5e9f0",
        paddingBottom: "1rem", marginBottom: "1rem",
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
      }}>
        <div>
          <div style={{
            fontSize: "11px", fontWeight: 500, letterSpacing: "0.12em",
            textTransform: "uppercase", color: "#D94A43", marginBottom: "6px",
          }}>
            {view === "picks"
              ? `Editors pick · ${blockLabelUpper}`
              : `${blockLabelUpper} · All this week`}
          </div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "22px", color: "#1a1a1a", fontWeight: 400 }}>
            {view === "picks"
              ? `${picksCount} article${picksCount !== 1 ? "s" : ""} selected`
              : `${allArticles.length > 0 ? allArticles.length : (allModeTotal || "...")} articles`}
          </div>
        </div>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: "4px" }}>
          {(["picks", "all"] as const).map(v => {
            const isActive = view === v;
            const label = v === "picks"
              ? `Editors pick · ${picksCount}`
              : `All · ${view === "all" && allArticles.length > 0 ? allArticles.length : allModeTotal}`;
            return (
              <button
                key={v}
                onClick={() => handleViewChange(v)}
                style={{
                  fontSize: "11px", fontWeight: isActive ? 500 : 400,
                  padding: "6px 12px", borderRadius: "6px",
                  border: isActive ? "none" : "0.5px solid #e2e8f0",
                  background: isActive ? "#1a1a1a" : "transparent",
                  color: isActive ? "#fff" : "#64748b",
                  cursor: "pointer", fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Picks mode */}
      {view === "picks" && (
        <>
          {picksArticles.length === 0 ? (
            <div style={{ color: "#94a3b8", fontSize: "13px", padding: "24px 0" }}>
              No editors picks for this block this week.
              <br />
              <span style={{ color: "#64748b" }}>Try toggling to All to see all articles.</span>
            </div>
          ) : (
            <div>
              {picksArticles.map((a, i) => (
                <ArticleRowPick
                  key={a.ea_id}
                  article={a}
                  isLast={i === picksArticles.length - 1}
                  isSpecialtyBlock={isSpecialtyBlock}
                  subShortNames={subShortNames}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* All mode */}
      {view === "all" && (
        <>
          <ArticleTypeFilter active={typeFilter} onChange={handleFilterChange} />
          {loading ? (
            <div style={{ color: "#94a3b8", fontSize: "13px", padding: "24px 0" }}>Loading…</div>
          ) : filteredAll.length === 0 ? (
            <div style={{ color: "#94a3b8", fontSize: "13px", padding: "24px 0" }}>
              {typeFilter !== "All" ? "No articles match this filter." : "No articles found for this block this week."}
            </div>
          ) : (
            <>
              <div>
                {pagedArticles.map((a, i) => (
                  <ArticleRowCompact
                    key={a.id}
                    article={a}
                    isLast={i === pagedArticles.length - 1}
                    isSpecialtyBlock={isSpecialtyBlock}
                    subShortNames={subShortNames}
                  />
                ))}
              </div>

              {/* Pagination — only when list spans multiple pages */}
              {totalPages > 1 ? (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  paddingTop: "24px", borderTop: "0.5px solid #e5e9f0", marginTop: "16px",
                }}>
                  {/* Status */}
                  <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                    Showing {showingFrom}–{showingTo} of {filteredAll.length}
                  </div>

                  {/* Page controls */}
                  <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
                    <button
                      onClick={() => safePage > 1 && handlePageChange(safePage - 1)}
                      disabled={safePage === 1}
                      style={navBtnStyle(safePage === 1)}
                    >
                      ‹ Prev
                    </button>

                    {getPageNumbers(safePage, totalPages).map((p, i) =>
                      p === "…" ? (
                        <span key={`ell-${i}`} style={{ fontSize: "13px", color: "#94a3b8", padding: "6px 4px" }}>…</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => handlePageChange(p as number)}
                          style={{
                            fontSize: "13px", padding: "6px 12px", borderRadius: "6px",
                            border: "none",
                            background: p === safePage ? "#1A1A1A" : "transparent",
                            color: p === safePage ? "#fff" : "#64748b",
                            fontWeight: p === safePage ? 500 : 400,
                            cursor: p === safePage ? "default" : "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          {p}
                        </button>
                      )
                    )}

                    <button
                      onClick={() => safePage < totalPages && handlePageChange(safePage + 1)}
                      disabled={safePage === totalPages}
                      style={navBtnStyle(safePage === totalPages)}
                    >
                      Next ›
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: "11px", color: "#94a3b8", textAlign: "center", paddingTop: "16px" }}>
                  Showing {filteredAll.length} of {allArticles.length} articles
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
