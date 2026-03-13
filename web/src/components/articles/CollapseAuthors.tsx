"use client";

import { useState } from "react";
import Link from "next/link";
import { parseAffiliation } from "@/lib/affiliations";

interface Author {
  id?: string;
  lastName?: string;
  foreName?: string;
  affiliation?: string | null;
  affiliations?: string[] | null;
  orcid?: string | null;
  author_score?: number | null;
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
              {a.orcid && (
                <a
                  href={`https://orcid.org/${a.orcid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "12px", color: "#E83B2A", textDecoration: "none" }}
                >
                  ORCID: {a.orcid}
                </a>
              )}
              {(a.affiliations?.[0] ?? a.affiliation) && (() => {
                const affStr = a.affiliations?.[0] ?? a.affiliation!;
                const parsed = parseAffiliation([affStr]);
                const badges = [
                  parsed.department && { label: "Dept", value: parsed.department },
                  parsed.hospital   && { label: "Hospital", value: parsed.hospital },
                  parsed.city       && { label: "City", value: parsed.city },
                  parsed.country    && { label: "Country", value: parsed.country },
                ].filter(Boolean) as { label: string; value: string }[];
                return (
                  <div style={{ marginTop: "4px" }}>
                    <p style={{ fontSize: "12px", color: "#9ca3af", margin: "0 0 4px 0", lineHeight: 1.4 }}>
                      {affStr}
                    </p>
                    {badges.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {badges.map((b) => (
                          <span key={b.label} style={{
                            fontSize: "11px", color: "#5a6a85",
                            background: "#EEF2F7", borderRadius: "4px",
                            padding: "2px 6px", lineHeight: 1.4,
                          }}>
                            {b.label}: {b.value}
                          </span>
                        ))}
                      </div>
                    )}
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
