"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SuggestedAuthor {
  id: string;
  display_name: string;
  country: string | null;
  city: string | null;
  hospital: string | null;
  region: string | null;
  article_count: number;
}

interface Props {
  userRegion: string | null;
}

export default function SuggestedAuthors({ userRegion: _userRegion }: Props) {
  const [authors, setAuthors] = useState<SuggestedAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [followLoading, setFollowLoading] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/authors/suggested", { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data: unknown) => {
        setAuthors((data as { authors?: SuggestedAuthor[] })?.authors ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, []);

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
    const method = isFollowing ? "DELETE" : "POST";
    const res = await fetch(`/api/authors/${authorId}/follow`, { method });
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

  if (!loading && visible.length === 0) return null;

  return (
    <div style={{
      background: "#fff",
      borderRadius: "14px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
      padding: "24px 28px",
    }}>
      {/* Header */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "15px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
          Interesting authors for you
        </div>
        <div style={{ fontSize: "12px", color: "#94a3b8" }}>
          Researchers publishing in your subspecialties from other regions
        </div>
      </div>

      {/* Skeleton */}
      {loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{
              height: "96px", borderRadius: "10px",
              background: "linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.4s infinite",
            }} />
          ))}
        </div>
      )}

      {/* Cards */}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
          {visible.map((author) => {
            const isFollowing = followed.has(author.id);
            const isFollowLoading = followLoading.has(author.id);
            const location = [author.city, author.country].filter(Boolean).join(", ");
            return (
              <div
                key={author.id}
                style={{
                  position: "relative",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  transition: "opacity 0.2s ease",
                }}
              >
                {/* Dismiss button */}
                <button
                  onClick={() => dismiss(author.id)}
                  title="Not interested"
                  style={{
                    position: "absolute", top: "10px", right: "10px",
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

                {/* Name */}
                <Link
                  href={`/authors/${author.id}`}
                  style={{
                    fontSize: "13px", fontWeight: 700, color: "#1e293b",
                    textDecoration: "none", paddingRight: "20px", lineHeight: 1.3,
                  }}
                >
                  {author.display_name}
                </Link>

                {/* Meta */}
                <div style={{ fontSize: "11px", color: "#64748b", lineHeight: 1.4 }}>
                  {location && <div>{location}</div>}
                  {author.hospital && (
                    <div style={{
                      maxWidth: "100%", overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                      color: "#94a3b8",
                    }}>
                      {author.hospital}
                    </div>
                  )}
                  <div style={{ color: "#94a3b8", marginTop: "2px" }}>
                    {author.article_count} articles
                  </div>
                </div>

                {/* Follow button */}
                <button
                  onClick={() => toggleFollow(author.id)}
                  disabled={isFollowLoading}
                  style={{
                    alignSelf: "flex-start",
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
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
