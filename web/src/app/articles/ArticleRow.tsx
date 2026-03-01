"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ArticleRowProps {
  id: string;
  title: string;
  journalAbbr: string | null;
  publishedYear: number | null;
  firstAuthor: string;
  publicationTypes: string[];
}

export default function ArticleRow({
  id,
  title,
  journalAbbr,
  publishedYear,
  firstAuthor,
  publicationTypes,
}: ArticleRowProps) {
  const [hovered, setHovered] = useState(false);
  const router = useRouter();

  const meta = [journalAbbr, publishedYear ? String(publishedYear) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      onClick={() => router.push(`/articles/${id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ padding: "20px 0", borderBottom: "1px solid #f0f0f0", cursor: "pointer" }}
    >
      {/* Line 1: journal + year */}
      {meta && (
        <p style={{
          fontSize: "12px", textTransform: "uppercase", color: "#999",
          letterSpacing: "0.02em", margin: "0 0 6px 0",
        }}>
          {meta}
        </p>
      )}

      {/* Line 2: title */}
      <p style={{
        fontSize: "16px", fontWeight: 700, lineHeight: 1.4,
        color: hovered ? "#E83B2A" : "#1a1a1a",
        transition: "color 0.15s ease",
        margin: "0 0 6px 0",
      }}>
        {title}
      </p>

      {/* Line 3: first author */}
      {firstAuthor && (
        <p style={{ fontSize: "13px", color: "#888", margin: "0 0 8px 0" }}>
          {firstAuthor}
        </p>
      )}

      {/* Line 4: publication type pills */}
      {publicationTypes.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "2px" }}>
          {publicationTypes.map((pt, i) => (
            <span key={i} style={{
              background: "#f4f4f4", color: "#555",
              fontSize: "11px", padding: "2px 8px", borderRadius: "10px",
            }}>
              {pt}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
