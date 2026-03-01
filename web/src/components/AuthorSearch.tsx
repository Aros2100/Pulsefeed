"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Author {
  id: string;
  display_name: string;
  hospital: string | null;
  city: string | null;
  country: string | null;
}

export interface AuthorMeta {
  name: string;
  hospital: string | null;
  city: string | null;
  country: string | null;
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

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("authors")
        .select("id, display_name, hospital, city, country")
        .ilike("display_name", `%${query}%`)
        .limit(8);
      setResults((data as Author[]) ?? []);
      setSearching(false);
    }, 300);

    return () => clearTimeout(timer);
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
          Search by name
        </label>
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
            padding: "10px 14px",
            fontSize: "14px",
            color: "#1a1a1a",
            outline: "none",
            background: "#fff",
          }}
        />
        {searching && (
          <p style={{ marginTop: "6px", fontSize: "12px", color: "#888" }}>
            Searching…
          </p>
        )}
        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <p style={{ marginTop: "6px", fontSize: "12px", color: "#888" }}>
            No authors found.
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
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onSelect(author.id, {
                      name: author.display_name,
                      hospital: author.hospital,
                      city: author.city,
                      country: author.country,
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
                  That&apos;s me
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
