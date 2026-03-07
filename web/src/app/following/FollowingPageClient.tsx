"use client";

import { useState } from "react";
import Link from "next/link";
import UnfollowButton from "@/components/UnfollowButton";
import ScoreBadge from "@/components/ScoreBadge";

interface Author {
  id:            string;
  display_name:  string | null;
  department:    string | null;
  hospital:      string | null;
  city:          string | null;
  country:       string | null;
  article_count: number | null;
  author_score:  number | null;
}

export default function FollowingPageClient({ initialAuthors }: { initialAuthors: Author[] }) {
  const [authors, setAuthors] = useState(initialAuthors);

  function remove(id: string) {
    setAuthors((prev) => prev.filter((a) => a.id !== id));
  }

  const card: React.CSSProperties = {
    background: "#fff", borderRadius: "10px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
    marginBottom: "16px",
  };

  return (
    <div style={card}>
      <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px", borderRadius: "10px 10px 0 0" }}>
        <span style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
          Authors · {authors.length} following
        </span>
      </div>

      {authors.map((author, i) => {
        const meta = [author.department, author.hospital, author.city]
          .filter(Boolean).join(" · ");
        return (
          <div
            key={author.id}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderTop: i === 0 ? undefined : "1px solid #f0f0f0" }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <Link
                href={`/authors/${author.id}`}
                style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a", textDecoration: "none" }}
              >
                {author.display_name ?? "Unknown"}
              </Link>
              {meta && <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>{meta}</div>}
            </div>
            <div style={{ marginLeft: "16px", flexShrink: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              {author.author_score != null && <ScoreBadge score={author.author_score} />}
              <UnfollowButton authorId={author.id} onUnfollow={() => remove(author.id)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
