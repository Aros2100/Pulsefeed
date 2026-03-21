"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface Author {
  id: string;
  display_name: string;
  hospital: string | null;
  city: string | null;
  country: string | null;
  department: string | null;
  article_count: number | null;
}

export interface AuthorMeta {
  name: string;
  hospital: string | null;
  city: string | null;
  country: string | null;
  state: string | null;
  department: string | null;
}

interface Props {
  onSelect: (authorId: string, meta: AuthorMeta) => void;
  onSkip: () => void;
  skipLabel?: string;
  initialQuery?: string;
}

export default function AuthorSearch({
  onSelect,
  onSkip,
  skipLabel = "Skip this step",
  initialQuery = "",
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Author[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("authors")
        .select("id, display_name, hospital, city, country, department, article_count")
        .ilike("display_name", `%${trimmed}%`)
        .limit(8);
      setResults((data as Author[]) ?? []);
      setSearching(false);
      setHasSearched(true);
    }, 300);
    return () => {
      clearTimeout(timer);
      setSearching(false);
    };
  }, [query]);

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <label
          htmlFor="author-search"
          style={{
            display: "block",
            fontSize: "13px",
            fontWeight: 500,
            color: "#1a1a1a",
            marginBottom: "6px",
          }}
        >
          Søg efter navn
        </label>
        <div style={{ position: "relative" }}>
          <input
            id="author-search"
            type="text"
            placeholder="e.g. John Smith…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid #d1d5db",
              borderRadius: "7px",
              padding: "10px 36px 10px 14px",
              fontSize: "14px",
              color: "#1a1a1a",
              outline: "none",
              background: "#fff",
            }}
          />
          {searching && (
            <span style={{
              position: "absolute",
              right: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: "12px",
              color: "#888",
            }}>
              …
            </span>
          )}
        </div>
        {hasSearched && !searching && results.length === 0 && (
          <p style={{ marginTop: "6px", fontSize: "12px", color: "#888" }}>
            Ingen forfattere fundet.
          </p>
        )}
      </div>

      {results.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px 0" }}>
          {results.map((author) => (
            <li
              key={author.id}
              style={{
                border: "1px solid #e2e6ea",
                borderRadius: "8px",
                padding: "12px 14px",
                marginBottom: "8px",
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {author.display_name}
                  </p>
                  {[author.hospital, author.city, author.country].some(Boolean) && (
                    <p style={{ fontSize: "12px", color: "#888", margin: "3px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {[author.hospital, author.city, author.country].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {author.article_count != null && author.article_count > 0 && (
                    <p style={{ fontSize: "11px", color: "#64748b", margin: "2px 0 0" }}>
                      {author.article_count} {author.article_count === 1 ? "artikel" : "artikler"}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onSelect(author.id, {
                      name: author.display_name,
                      hospital: author.hospital,
                      city: author.city,
                      country: author.country,
                      state: null,
                      department: author.department,
                    })
                  }
                  style={{
                    flexShrink: 0,
                    background: "#1a1a1a",
                    color: "#fff",
                    border: "none",
                    borderRadius: "7px",
                    padding: "6px 14px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Det er mig
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onSkip}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          fontSize: "13px",
          color: "#888",
          cursor: "pointer",
          textDecoration: "underline",
          textUnderlineOffset: "2px",
        }}
      >
        {skipLabel}
      </button>
    </div>
  );
}
