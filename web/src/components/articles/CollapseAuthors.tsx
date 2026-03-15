"use client";

import { useState } from "react";
import Link from "next/link";

interface Author {
  id?: string;
  lastName?: string;
  foreName?: string;
  author_score?: number | null;
  geo?: {
    department: string | null;
    hospital: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    verified_by: string | null;
  } | null;
}

const INITIAL_COUNT = 3;

export default function CollapseAuthors({ authors }: { authors: Author[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? authors : authors.slice(0, INITIAL_COUNT);

  return (
    <div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "16px" }}>
        {visible.map((a, i) => {
          const name = [a.foreName, a.lastName].filter(Boolean).join(" ") || "—";
          return (
            <li key={i}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                {a.id ? (
                  <Link href={`/admin/authors/${a.id}`} style={{ fontSize: "14px", fontWeight: 700, color: "#1A1A1A", textDecoration: "none" }}>
                    {name}
                  </Link>
                ) : (
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#1A1A1A" }}>
                    {name}
                  </span>
                )}
                {a.author_score != null && (
                  <span style={{
                    fontSize: "11px", fontWeight: 700, borderRadius: "5px", padding: "1px 6px",
                    background: a.author_score >= 35 ? "#f0fdf4" : a.author_score >= 15 ? "#fffbeb" : "#fef2f2",
                    color:      a.author_score >= 35 ? "#15803d" : a.author_score >= 15 ? "#d97706" : "#b91c1c",
                  }}>
                    {a.author_score}
                  </span>
                )}
              </div>
              {(() => {
                const geo = a.geo;
                if (!geo) return null;

                const geoStr = [geo.department, geo.hospital, geo.city, geo.state, geo.country]
                  .filter(Boolean).join(", ");

                const verifiedBy = geo.verified_by;
                const verifiedBadge = verifiedBy === "openalex"
                  ? { label: "OpenAlex",     bg: "#f0fdf4", color: "#15803d" }
                  : verifiedBy === "human"
                  ? { label: "Verificeret",  bg: "#eff6ff", color: "#1d4ed8" }
                  : { label: "Uverificeret", bg: "#EEF2F7", color: "#5a6a85" };

                return (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px", flexWrap: "wrap" }}>
                    {geoStr && (
                      <span style={{ fontSize: "12px", color: "#6b7280" }}>{geoStr}</span>
                    )}
                    <span style={{
                      fontSize: "11px", fontWeight: 600, borderRadius: "4px",
                      padding: "2px 6px", lineHeight: 1.4,
                      background: verifiedBadge.bg, color: verifiedBadge.color,
                    }}>
                      {verifiedBadge.label}
                    </span>
                  </div>
                );
              })()}
            </li>
          );
        })}
      </ul>

      {authors.length > INITIAL_COUNT && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: "16px",
            fontSize: "12px",
            fontWeight: 600,
            color: "#E83B2A",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          {expanded ? "Show fewer" : `Show all ${authors.length} authors`}
        </button>
      )}
    </div>
  );
}
