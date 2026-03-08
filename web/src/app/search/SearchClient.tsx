"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { SPECIALTIES } from "@/lib/auth/specialties";

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
  specialty_tags: string[] | null;
}

interface Props {
  articles: Article[];
  specialtyTags: string[];
  initialQuery: string;
  initialSpecialties: string[];
}

function stars(value: number | null): string {
  if (!value) return "";
  const v = Math.round(Math.max(1, Math.min(5, value)));
  return "★".repeat(v) + "☆".repeat(5 - v);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
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

function specialtyLabel(slug: string): string {
  const known = SPECIALTIES.find((s) => s.slug === slug);
  if (known) return known.label;
  return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
}

export default function SearchClient({ articles, specialtyTags, initialQuery, initialSpecialties }: Props) {
  const [query, setQuery] = useState(initialQuery);
  // Empty array = "All" mode (show all specialties)
  const [activeSpecialties, setActiveSpecialties] = useState<string[]>(
    initialSpecialties.length === specialtyTags.length ? [] : initialSpecialties
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const router = useRouter();
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync state to URL (debounced 300ms)
  useEffect(() => {
    if (urlTimer.current) clearTimeout(urlTimer.current);
    urlTimer.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (activeSpecialties.length > 0) params.set("specialties", activeSpecialties.join(","));
      const qs = params.toString();
      router.replace(qs ? `/search?${qs}` : "/search", { scroll: false });
    }, 300);
    return () => { if (urlTimer.current) clearTimeout(urlTimer.current); };
  }, [query, activeSpecialties, router]);

  const allActive = activeSpecialties.length === 0;

  // Filter articles client-side
  const filtered = articles.filter((article) => {
    // Specialty filter: only approved articles with matching tag
    if (!allActive) {
      const tags = article.specialty_tags ?? [];
      if (!tags.some((t) => activeSpecialties.includes(t))) return false;
    }
    // Text search
    const q = query.trim().toLowerCase();
    if (q) {
      const inTitle = article.title.toLowerCase().includes(q);
      const inJournal = (article.journal_abbr ?? "").toLowerCase().includes(q);
      const inAuthor = firstAuthor(article.authors).toLowerCase().includes(q);
      if (!inTitle && !inJournal && !inAuthor) return false;
    }
    return true;
  });

  function toggleSpecialty(slug: string) {
    setActiveSpecialties((prev) => {
      if (allActive) {
        // Was showing all → select only this one
        return [slug];
      }
      if (prev.includes(slug)) {
        const next = prev.filter((s) => s !== slug);
        // If deselecting the last one, go back to "All"
        return next.length === 0 ? [] : next;
      }
      const next = [...prev, slug];
      // If all are now selected, collapse to "All" mode
      return next.length === specialtyTags.length ? [] : next;
    });
  }

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", color: "#1a1a1a" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* Search + filter card */}
        <div style={{
          background: "#fff",
          borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          marginBottom: "12px",
          overflow: "hidden",
        }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
            <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700 }}>
              Keyword Search
            </div>
          </div>
          <div style={{ padding: "16px 24px 20px" }}>

            {/* Search input */}
            <input
              type="text"
              placeholder="Search by title, author, journal..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              style={{
                width: "100%",
                fontSize: "15px",
                padding: "10px 14px",
                border: "1px solid #dde3ed",
                borderRadius: "8px",
                outline: "none",
                background: "#fafbfd",
                boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#E83B2A")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#dde3ed")}
            />

            {/* Specialty filter chips */}
            {specialtyTags.length > 0 && (
              <div style={{ marginTop: "14px" }}>
                <div style={{
                  fontSize: "11px", color: "#5a6a85", textTransform: "uppercase",
                  letterSpacing: "0.07em", fontWeight: 700, marginBottom: "8px",
                }}>
                  Specialty
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>

                  {/* All chip */}
                  <button
                    onClick={() => setActiveSpecialties([])}
                    style={{
                      fontSize: "12px",
                      padding: "5px 14px",
                      borderRadius: "20px",
                      border: allActive ? "1.5px solid #1a1a1a" : "1px solid #dde3ed",
                      background: allActive ? "#1a1a1a" : "#fff",
                      color: allActive ? "#fff" : "#5a6a85",
                      cursor: "pointer",
                      fontWeight: allActive ? 600 : 400,
                      lineHeight: 1.4,
                    }}
                  >
                    All
                  </button>

                  {specialtyTags.map((tag) => {
                    const isActive = !allActive && activeSpecialties.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => toggleSpecialty(tag)}
                        style={{
                          fontSize: "12px",
                          padding: "5px 14px",
                          borderRadius: "20px",
                          border: isActive ? "1.5px solid #E83B2A" : "1px solid #dde3ed",
                          background: isActive ? "#E83B2A" : "#fff",
                          color: isActive ? "#fff" : "#5a6a85",
                          cursor: "pointer",
                          fontWeight: isActive ? 600 : 400,
                          lineHeight: 1.4,
                        }}
                      >
                        {specialtyLabel(tag)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Result count */}
        <div style={{ fontSize: "13px", color: "#888", marginBottom: "10px", paddingLeft: "4px" }}>
          {filtered.length} {filtered.length === 1 ? "article" : "articles"}
          {query.trim() ? ` matching "${query.trim()}"` : ""}
          {!allActive && activeSpecialties.length === 1
            ? ` in ${specialtyLabel(activeSpecialties[0])}`
            : !allActive
            ? ` across ${activeSpecialties.length} specialties`
            : ""}
        </div>

        {/* Results card */}
        <div style={{
          background: "#fff",
          borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
            <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
              Results
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center", color: "#999", fontSize: "14px" }}>
              {query.trim() ? `No articles found for "${query.trim()}"` : "No articles match the selected filters."}
            </div>
          ) : (
            filtered.map((article, i) => {
              const rel = relevanceInfo(article.clinical_relevance);
              const isHovered = hoveredId === article.id;
              const author = firstAuthor(article.authors);
              const date = formatDate(article.published_date);
              const meta = [article.journal_abbr, date].filter(Boolean).join(" · ");
              const pubType = article.publication_types?.[0];

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
                      {!allActive && (article.specialty_tags ?? []).map((tag) => (
                        <span key={tag} style={{ fontSize: "11px", background: "#f5f0fe", border: "1px solid #d4c5f9", borderRadius: "4px", padding: "2px 8px", color: "#5a35a0" }}>
                          {specialtyLabel(tag)}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", minWidth: "90px", paddingTop: "2px" }}>
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
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
