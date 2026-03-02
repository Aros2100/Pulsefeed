"use client";

import { useState } from "react";
import Link from "next/link";

interface Article {
  id: string;
  title: string;
  journal_abbr: string | null;
  published_date: string | null;
  authors: unknown;
  status: string | null;
  circle: number | null;
  specialty_tags: string[];
  imported_at: string;
  enriched_at: string | null;
  ai_decision: string | null;
}

function firstAuthor(authors: unknown): string {
  if (!Array.isArray(authors) || authors.length === 0) return "";
  const a = authors[0] as { foreName?: string; lastName?: string };
  const name = [a.foreName, a.lastName].filter(Boolean).join(" ");
  return authors.length > 1 ? `${name} et al.` : name;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("da-DK", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  approved: { bg: "#f0fdf4", color: "#15803d" },
  rejected: { bg: "#fef2f2", color: "#b91c1c" },
  pending:  { bg: "#fffbeb", color: "#d97706" },
};

type FilterStatus = "all" | "approved" | "rejected" | "pending";

export default function AdminArticleListClient({ articles }: { articles: Article[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");

  const filtered = articles.filter((a) => {
    if (statusFilter !== "all" && (a.status ?? "pending") !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.title.toLowerCase().includes(q) && !(a.journal_abbr ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = {
    all: articles.length,
    approved: articles.filter((a) => a.status === "approved").length,
    rejected: articles.filter((a) => a.status === "rejected").length,
    pending:  articles.filter((a) => (a.status ?? "pending") === "pending").length,
  };

  const filters: { key: FilterStatus; label: string }[] = [
    { key: "all",      label: `Alle (${counts.all})` },
    { key: "approved", label: `Godkendt (${counts.approved})` },
    { key: "pending",  label: `Afventer (${counts.pending})` },
    { key: "rejected", label: `Afvist (${counts.rejected})` },
  ];

  return (
    <div>
      {/* Toolbar */}
      <div style={{
        background: "#fff",
        borderRadius: "10px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
        padding: "14px 20px",
        marginBottom: "12px",
        display: "flex",
        gap: "12px",
        alignItems: "center",
        flexWrap: "wrap",
      }}>
        <input
          type="text"
          placeholder="Søg titel eller tidsskrift…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: "200px", padding: "7px 12px",
            border: "1px solid #dde3ed", borderRadius: "6px",
            fontSize: "13px", outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: "6px" }}>
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              style={{
                fontSize: "12px", padding: "6px 12px", borderRadius: "6px", cursor: "pointer",
                background: statusFilter === f.key ? "#1a1a1a" : "#fff",
                color: statusFilter === f.key ? "#fff" : "#5a6a85",
                border: `1px solid ${statusFilter === f.key ? "#1a1a1a" : "#dde3ed"}`,
                whiteSpace: "nowrap",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: "#fff",
        borderRadius: "10px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
        overflow: "hidden",
      }}>
        <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 20px" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#5a6a85" }}>
            {filtered.length} artikler
          </span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", fontSize: "13px", color: "#888" }}>
            Ingen artikler matcher filteret
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Titel", "Tidsskrift", "Importeret", "Circle", "Status", ""].map((h) => (
                  <th key={h} style={{
                    padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85",
                    borderBottom: "1px solid #eef0f4", background: "#f8f9fb", whiteSpace: "nowrap",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => {
                const status = a.status ?? "pending";
                const s = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
                const author = firstAuthor(a.authors);
                return (
                  <tr key={a.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid #f1f3f7", maxWidth: "360px" }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a", lineHeight: 1.4 }}>
                        {a.title}
                      </div>
                      {author && (
                        <div style={{ fontSize: "11px", color: "#888", marginTop: "3px" }}>{author}</div>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid #f1f3f7", fontSize: "12px", color: "#5a6a85", whiteSpace: "nowrap" }}>
                      {a.journal_abbr ?? "—"}
                    </td>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid #f1f3f7", fontSize: "12px", color: "#5a6a85", whiteSpace: "nowrap" }}>
                      {formatDate(a.imported_at)}
                    </td>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid #f1f3f7", fontSize: "12px", color: "#5a6a85", whiteSpace: "nowrap" }}>
                      C{a.circle ?? "—"}
                    </td>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid #f1f3f7" }}>
                      <span style={{
                        fontSize: "11px", fontWeight: 600, borderRadius: "999px",
                        padding: "2px 8px", background: s.bg, color: s.color,
                      }}>
                        {status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid #f1f3f7", whiteSpace: "nowrap" }}>
                      <Link
                        href={`/admin/articles/${a.id}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: "12px", color: "#E83B2A", fontWeight: 600, textDecoration: "none" }}
                      >
                        Log →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
