"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SUBSPECIALTY_OPTIONS } from "@/lib/lab/classification-options";

const SUBSPECIALTY_SET = new Set<string>(SUBSPECIALTY_OPTIONS as unknown as string[]);

interface SuggestedAuthor {
  id: string;
  display_name: string;
  country: string | null;
  city: string | null;
  hospital: string | null;
  region: string | null;
  article_count: number;
  last_article_date: string | null;
  top_mesh_terms: string[];
}

interface Props {
  userSubspecialties: string[] | null;
}

export default function SuggestedAuthors({ userSubspecialties }: Props) {
  // Filter to canonical subspecialties only (exclude top-level "Neurosurgery")
  const subTabs = (userSubspecialties ?? []).filter((s) => SUBSPECIALTY_SET.has(s));

  const [activeSubFilter, setActiveSubFilter] = useState<string>("All");
  const [authors, setAuthors] = useState<SuggestedAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [followLoading, setFollowLoading] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setAuthors([]);

    const url =
      activeSubFilter === "All"
        ? "/api/authors/suggested"
        : `/api/authors/suggested?subspecialty=${encodeURIComponent(activeSubFilter)}`;

    fetch(url, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data: unknown) => {
        setAuthors((data as { authors?: SuggestedAuthor[] })?.authors ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [activeSubFilter]);

  async function dismiss(authorId: string) {
    setDismissed((prev) => new Set([...prev, authorId]));
    await fetch("/api/authors/suggested/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author_id: authorId }),
    });
  }

  async function toggleFollow(authorId: string) {
    setFollowLoading((prev) => new Set([...prev, authorId]));
    const isFollowing = followed.has(authorId);
    const res = await fetch(`/api/authors/${authorId}/follow`, {
      method: isFollowing ? "DELETE" : "POST",
    });
    if (res.ok) {
      setFollowed((prev) => {
        const next = new Set(prev);
        isFollowing ? next.delete(authorId) : next.add(authorId);
        return next;
      });
    }
    setFollowLoading((prev) => {
      const next = new Set(prev);
      next.delete(authorId);
      return next;
    });
  }

  const visible = authors.filter((a) => !dismissed.has(a.id));

  if (!loading && visible.length === 0 && activeSubFilter === "All") return null;

  return (
    <div style={{
      background: "#fff",
      borderRadius: "14px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
      padding: "24px 28px",
    }}>
      {/* Header */}
      <div style={{ marginBottom: subTabs.length > 0 ? "16px" : "20px" }}>
        <div style={{ fontSize: "15px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
          Interesting authors for you to follow
        </div>
        <div style={{ fontSize: "12px", color: "#94a3b8" }}>
          Researchers publishing in your subspecialties from other countries
        </div>
      </div>

      {/* Subspecialty tabs */}
      {subTabs.length > 0 && (
        <div style={{
          display: "flex", gap: "4px", flexWrap: "wrap",
          marginBottom: "20px",
        }}>
          {["All", ...subTabs].map((tab) => {
            const isActive = activeSubFilter === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveSubFilter(tab)}
                style={{
                  padding: "5px 12px",
                  fontSize: "12px",
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "#fff" : "#64748b",
                  background: isActive
                    ? "linear-gradient(135deg, #c0392b, #a93226)"
                    : "#f1f5f9",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  fontFamily: "inherit",
                  boxShadow: isActive ? "0 2px 6px rgba(192,57,43,0.25)" : "none",
                  whiteSpace: "nowrap",
                }}
              >
                {tab}
              </button>
            );
          })}
        </div>
      )}

      {/* Skeleton */}
      {loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{
              height: "120px", borderRadius: "10px",
              background: "linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.4s infinite",
            }} />
          ))}
        </div>
      )}

      {/* Empty state for specific tab */}
      {!loading && visible.length === 0 && activeSubFilter !== "All" && (
        <div style={{ fontSize: "13px", color: "#94a3b8", textAlign: "center", padding: "24px 0" }}>
          No suggestions for this subspecialty yet.
        </div>
      )}

      {/* Cards */}
      {!loading && visible.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
          {visible.map((author) => {
            const isFollowing = followed.has(author.id);
            const isFollowLoading = followLoading.has(author.id);
            const location = [author.city, author.country].filter(Boolean).join(", ");
            return (
              <div
                key={author.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  transition: "opacity 0.2s ease",
                }}
              >
                {/* Name + follow + dismiss */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
                  <Link
                    href={`/authors/${author.id}`}
                    style={{
                      fontSize: "13px", fontWeight: 700, color: "#1e293b",
                      textDecoration: "none", lineHeight: 1.3,
                    }}
                  >
                    {author.display_name}
                  </Link>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                    <button
                      onClick={() => toggleFollow(author.id)}
                      disabled={isFollowLoading}
                      style={{
                        fontSize: "11px", fontWeight: 600,
                        padding: "4px 12px", borderRadius: "6px",
                        border: isFollowing ? "1px solid #bbf7d0" : "1px solid #dde3ed",
                        background: isFollowing ? "#f0fdf4" : "#f8fafc",
                        color: isFollowing ? "#15803d" : "#5a6a85",
                        cursor: isFollowLoading ? "wait" : "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {isFollowing ? "Following ✓" : "Follow"}
                    </button>
                    <button
                      onClick={() => dismiss(author.id)}
                      title="Not interested"
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "#cbd5e1", fontSize: "14px", lineHeight: 1,
                        padding: "2px 4px", borderRadius: "4px",
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#94a3b8")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#cbd5e1")}
                    >
                      ×
                    </button>
                  </div>
                </div>

                {/* Location + hospital */}
                <div style={{ fontSize: "11px", color: "#64748b", lineHeight: 1.4 }}>
                  {location && <div>{location}</div>}
                  {author.hospital && (
                    <div style={{
                      overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap", color: "#94a3b8",
                    }}>
                      {author.hospital}
                    </div>
                  )}
                  <div style={{ color: "#94a3b8", marginTop: "1px" }}>
                    {author.article_count} articles
                    {author.last_article_date && (
                      <span style={{ marginLeft: "6px" }}>
                        · Last published: {author.last_article_date}
                      </span>
                    )}
                  </div>
                </div>

                {/* MeSH chips */}
                {author.top_mesh_terms?.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "2px" }}>
                    {author.top_mesh_terms.map((term) => (
                      <span
                        key={term}
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          fontSize: "10px",
                          fontWeight: 500,
                          color: "#475569",
                          background: "#f1f5f9",
                          border: "1px solid #e2e8f0",
                          borderRadius: "12px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {term}
                      </span>
                    ))}
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
