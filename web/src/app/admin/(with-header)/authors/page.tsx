"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const PAGE_SIZE = 50;

function AuthorScoreBadge({ score }: { score: number }) {
  const bg    = score >= 35 ? "#f0fdf4" : score >= 15 ? "#fffbeb" : "#fef2f2";
  const color = score >= 35 ? "#15803d" : score >= 15 ? "#d97706" : "#b91c1c";
  return (
    <span style={{ fontSize: "12px", fontWeight: 700, borderRadius: "6px", padding: "2px 8px", background: bg, color }}>
      {score}
    </span>
  );
}

interface Author {
  id: string;
  display_name: string;
  affiliations: string[] | null;
  article_count: number | null;
  author_score: number | null;
}

export default function AdminAuthorsPage() {
  const [query, setQuery] = useState("");
  const [authors, setAuthors] = useState<Author[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPage(0);
  }, [query]);

  useEffect(() => {
    const delay = query.trim().length >= 2 ? 300 : 0;
    const timer = setTimeout(async () => {
      setLoading(true);
      const supabase = createClient();
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let req = supabase
        .from("authors")
        .select("id, display_name, affiliations, article_count, author_score", { count: "exact" })
        .order("author_score", { ascending: false, nullsFirst: false })
        .order("article_count", { ascending: false, nullsFirst: false })
        .range(from, to);

      if (query.trim().length >= 2) {
        req = req.ilike("display_name", `%${query.trim()}%`);
      }

      const { data, count } = await req;
      setAuthors((data as Author[]) ?? []);
      setTotal(count ?? null);
      setLoading(false);
    }, delay);
    return () => clearTimeout(timer);
  }, [query, page]);

  const totalPages = total !== null ? Math.ceil(total / PAGE_SIZE) : null;

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Admin
          </Link>
        </div>

        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "26px", fontWeight: 700 }}>Authors</div>
          <div style={{ fontSize: "14px", color: "#888", marginTop: "4px" }}>
            {total !== null ? `${total.toLocaleString("da-DK")} forfattere i databasen` : "Browse researchers indexed in the database"}
          </div>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <input
            type="text"
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              padding: "10px 14px",
              fontSize: "14px",
              color: "#1a1a1a",
              outline: "none",
              background: "#fff",
            }}
          />
        </div>

        <div style={{
          background: "#fff",
          borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
              {loading ? "Loading…" : total !== null ? `Side ${page + 1} af ${totalPages} · ${total.toLocaleString("da-DK")} forfattere` : ""}
            </div>
          </div>

          {!loading && authors.length === 0 && (
            <div style={{ padding: "24px", fontSize: "14px", color: "#888" }}>No authors found.</div>
          )}

          {authors.map((author, i) => (
            <Link
              key={author.id}
              href={`/admin/authors/${author.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 24px",
                borderTop: i === 0 ? undefined : "1px solid #f0f0f0",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>
                  {author.display_name}
                </div>
                {author.affiliations && author.affiliations.length > 0 && (
                  <div style={{
                    fontSize: "12px", color: "#888", marginTop: "2px",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    maxWidth: "600px",
                  }}>
                    {author.affiliations[0]}
                  </div>
                )}
              </div>
              <div style={{ marginLeft: "16px", flexShrink: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                {author.author_score != null && (
                  <AuthorScoreBadge score={author.author_score} />
                )}
                <span style={{
                  fontSize: "12px", fontWeight: 600,
                  color: "#fff", background: "#5a6a85",
                  borderRadius: "10px", padding: "2px 8px",
                }}>
                  {author.article_count ?? 0}
                </span>
              </div>
            </Link>
          ))}

          {totalPages !== null && totalPages > 1 && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              padding: "16px 24px", borderTop: "1px solid #f0f0f0",
            }}>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{
                  fontSize: "13px", fontWeight: 600, padding: "6px 14px",
                  border: "1px solid #dde3ed", borderRadius: "6px", cursor: page === 0 ? "default" : "pointer",
                  background: "#fff", color: page === 0 ? "#bbb" : "#5a6a85",
                }}
              >
                ← Forrige
              </button>
              <span style={{ fontSize: "13px", color: "#5a6a85", minWidth: "80px", textAlign: "center" }}>
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                style={{
                  fontSize: "13px", fontWeight: 600, padding: "6px 14px",
                  border: "1px solid #dde3ed", borderRadius: "6px", cursor: page >= totalPages - 1 ? "default" : "pointer",
                  background: "#fff", color: page >= totalPages - 1 ? "#bbb" : "#5a6a85",
                }}
              >
                Næste →
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
