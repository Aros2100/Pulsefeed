"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SaveButton from "@/components/SaveButton";

interface Article {
  id: string;
  title: string;
  journal_abbr: string | null;
  published_date: string | null;
  authors: unknown;
  publication_types: string[] | null;
  news_value: number | null;
  clinical_relevance: string | null;
  enriched_at: string | null;
  imported_at: string;
}

interface Project { id: string; name: string }

interface Props {
  articles:      Article[];
  specialtyLabel: string;
  savedMap:      Record<string, string | null>;   // articleId → projectId | null
  projects:      Project[];
}

type Filter = "all" | "clinical_trials" | "high_impact" | "this_week";

function stars(value: number | null): string {
  if (!value) return "";
  const v = Math.round(Math.max(1, Math.min(5, value)));
  return "★".repeat(v) + "☆".repeat(5 - v);
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

function relevanceInfo(cr: string | null): { label: string; bg: string; color: string } | null {
  if (!cr) return null;
  const lower = cr.toLowerCase();
  if (lower.includes("practice")) return { label: "Practice changing", bg: "#fff3e0", color: "#e65100" };
  if (lower.includes("clinical")) return { label: "Clinically relevant", bg: "#e8f4e8", color: "#2d7a2d" };
  return { label: "Research only", bg: "#f0f0f0", color: "#666" };
}

const weekAgoMs = 7 * 24 * 60 * 60 * 1000;

function applyFilter(articles: Article[], filter: Filter): Article[] {
  const now = Date.now();
  switch (filter) {
    case "clinical_trials":
      return articles.filter((a) =>
        (a.publication_types ?? []).some((pt) =>
          pt.toLowerCase().includes("clinical trial") ||
          pt.toLowerCase().includes("randomized")
        )
      );
    case "high_impact":
      return articles.filter((a) => (a.news_value ?? 0) >= 4);
    case "this_week":
      return articles.filter((a) => now - new Date(a.imported_at).getTime() < weekAgoMs);
    default:
      return articles;
  }
}

export default function ArticleListClient({ articles, specialtyLabel, savedMap, projects }: Props) {
  const [filter, setFilter]     = useState<Filter>("all");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const router = useRouter();

  const filtered = applyFilter(articles, filter);

  const filters: { key: Filter; label: string }[] = [
    { key: "all",            label: "All" },
    { key: "clinical_trials", label: "Clinical trials" },
    { key: "high_impact",    label: "High impact" },
    { key: "this_week",      label: "This week" },
  ];

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
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700 }}>
              {specialtyLabel}
            </div>
          </div>
          <div style={{
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}>
            <div>
              <div style={{ fontSize: "20px", fontWeight: 700 }}>Articles</div>
              <div style={{ fontSize: "13px", color: "#999" }}>{filtered.length} articles</div>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              {filters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    fontSize: "12px",
                    background: filter === f.key ? "#1a1a1a" : "#fff",
                    border: `1px solid ${filter === f.key ? "#1a1a1a" : "#dde3ed"}`,
                    borderRadius: "6px",
                    padding: "6px 12px",
                    color: filter === f.key ? "#fff" : "#5a6a85",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Articles card */}
        <div style={{
          background: "#fff",
          borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
            <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
              Latest articles
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center", color: "#999", fontSize: "14px" }}>
              No articles match this filter.
            </div>
          ) : (
            filtered.map((article, i) => {
              const rel      = relevanceInfo(article.clinical_relevance);
              const isHovered = hoveredId === article.id;
              const author   = firstAuthor(article.authors);
              const date     = formatDate(article.published_date);
              const meta     = [article.journal_abbr, date].filter(Boolean).join(" · ");
              const pubType  = article.publication_types?.[0];
              const isSaved  = article.id in savedMap;
              const savedPid = savedMap[article.id] ?? null;

              return (
                <div
                  key={article.id}
                  onClick={() => router.push(`/articles/${article.id}`)}
                  onMouseEnter={() => setHoveredId(article.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    padding: "16px 24px",
                    borderBottom: i < filtered.length - 1 ? "1px solid #f0f0f0" : undefined,
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
                      <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "5px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
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
                    <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
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

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px", paddingTop: "2px" }}>
                    {/* Save button — stopPropagation so row click doesn't navigate */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <SaveButton
                        articleId={article.id}
                        initialSaved={isSaved}
                        initialProjectId={savedPid}
                        projects={projects}
                      />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                      {article.news_value && (
                        <div style={{ fontSize: "13px", color: "#f4a100", letterSpacing: "1px" }}>
                          {stars(article.news_value)}
                        </div>
                      )}
                      {rel && (
                        <div style={{
                          fontSize: "11px", padding: "2px 8px", borderRadius: "10px",
                          fontWeight: 600, whiteSpace: "nowrap",
                          background: rel.bg, color: rel.color,
                        }}>
                          {rel.label}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
