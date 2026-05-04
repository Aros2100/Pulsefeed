"use client";

import { useState, useEffect, useCallback } from "react";
import type { EditionArticle, AllModeArticle } from "./types";
import { ArticleRowPick } from "./ArticleRowPick";
import { ArticleRowCompact } from "./ArticleRowCompact";
import { ArticleTypeFilter } from "./ArticleTypeFilter";

interface Props {
  editionId: string;
  blockKey: string;
  blockLabel: string;
  picksArticles: EditionArticle[];
  allModeTotal: number;  // total articles this week for this block (for the toggle label)
  onViewChange?: (view: "picks" | "all") => void;
  initialView?: "picks" | "all";
}

export function EditionDetail({
  editionId,
  blockKey,
  blockLabel,
  picksArticles,
  allModeTotal,
  onViewChange,
  initialView = "picks",
}: Props) {
  const [view, setView] = useState<"picks" | "all">(initialView);
  const [typeFilter, setTypeFilter] = useState("All");
  const [allArticles, setAllArticles] = useState<AllModeArticle[]>([]);
  const [loading, setLoading] = useState(false);

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

  const picksCount = picksArticles.length;
  const blockLabelUpper = blockLabel.toUpperCase();

  const filteredAll = typeFilter === "All"
    ? allArticles
    : typeFilter === "Other"
      ? allArticles.filter(a => !a.article_type || !["Meta-analysis","Review","Intervention study","Non-interventional study","Case","Guideline","Surgical Technique","Tech"].includes(a.article_type))
      : allArticles.filter(a => a.article_type === typeFilter);

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* Block header */}
      <div style={{
        borderBottom: "0.5px solid #e5e9f0",
        paddingBottom: "1rem", marginBottom: "1rem",
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
      }}>
        <div>
          <div style={{
            fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em",
            textTransform: "uppercase", color: "#94a3b8", marginBottom: "4px",
          }}>
            {view === "picks"
              ? `Editors pick · ${blockLabelUpper}`
              : `${blockLabelUpper} · All this week`}
          </div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "22px", color: "#1a1a1a", fontWeight: 400 }}>
            {view === "picks"
              ? `${picksCount} article${picksCount !== 1 ? "s" : ""} selected`
              : `${allModeTotal > 0 ? allModeTotal : (allArticles.length || "...")} articles`}
          </div>
        </div>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: "4px" }}>
          {(["picks", "all"] as const).map(v => {
            const isActive = view === v;
            const label = v === "picks" ? `Editors pick · ${picksCount}` : `All · ${allModeTotal}`;
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
                <ArticleRowPick key={a.ea_id} article={a} isLast={i === picksArticles.length - 1} />
              ))}
            </div>
          )}
        </>
      )}

      {/* All mode */}
      {view === "all" && (
        <>
          <ArticleTypeFilter active={typeFilter} onChange={setTypeFilter} />
          {loading ? (
            <div style={{ color: "#94a3b8", fontSize: "13px", padding: "24px 0" }}>Loading…</div>
          ) : filteredAll.length === 0 ? (
            <div style={{ color: "#94a3b8", fontSize: "13px", padding: "24px 0" }}>
              {typeFilter !== "All" ? "No articles match this filter." : "No articles found for this block this week."}
            </div>
          ) : (
            <>
              <div>
                {filteredAll.map((a, i) => (
                  <ArticleRowCompact key={a.id} article={a} isLast={i === filteredAll.length - 1} />
                ))}
              </div>
              <div style={{ fontSize: "11px", color: "#94a3b8", textAlign: "center", paddingTop: "16px" }}>
                Showing {filteredAll.length} of {allArticles.length} articles
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
