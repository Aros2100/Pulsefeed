"use client";

import { useState } from "react";

interface Author {
  lastName?: string;
  foreName?: string;
  affiliation?: string | null;
  orcid?: string | null;
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
              <p style={{ fontSize: "14px", fontWeight: 700, color: "#1A1A1A", margin: "0 0 2px 0" }}>
                {name}
              </p>
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
              {a.affiliation && (
                <p style={{ fontSize: "12px", color: "#9ca3af", margin: "2px 0 0 0", lineHeight: 1.4 }}>
                  {a.affiliation}
                </p>
              )}
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
