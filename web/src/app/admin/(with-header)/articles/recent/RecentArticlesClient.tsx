"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

interface ArticleRow {
  id: string;
  title: string;
  journal_abbr: string | null;
  published_date: string | null;
  authors: unknown;
  article_type?: string | null;
}

type Period = "today" | "week" | "month" | "year";
type SortField = "title" | "journal_abbr" | "published_date" | "article_type";

const ARTICLE_TYPES = [
  "Meta-analysis",
  "Review",
  "Intervention study",
  "Non-interventional study",
  "Basic study",
  "Case",
  "Guideline",
  "Technique & Technology",
  "Administration",
  "Letters & Notices",
  "Unclassified",
] as const;

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week:  "This week",
  month: "This month",
  year:  "This year",
};

function getPubDateRange(period: Period): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  if (period === "today") return { from: to, to };
  if (period === "week") {
    const d = new Date(today);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return { from: d.toISOString().slice(0, 10), to };
  }
  if (period === "month") {
    return { from: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`, to };
  }
  return { from: `${today.getFullYear()}-01-01`, to };
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function authorCount(authors: unknown): number {
  return Array.isArray(authors) ? authors.length : 0;
}

function SortArrow({ field, sortBy, sortDir }: { field: SortField; sortBy: SortField; sortDir: "asc" | "desc" }) {
  if (field !== sortBy) return <span style={{ color: "#ccc", marginLeft: "4px" }}>↕</span>;
  return <span style={{ color: "#E83B2A", marginLeft: "4px" }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
}

function PillButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px",
        fontSize: "12px",
        fontWeight: active ? 700 : 400,
        borderRadius: "20px",
        border: `1px solid ${active ? "#1a1a1a" : "#dde3ed"}`,
        background: active ? "#1a1a1a" : "#fff",
        color: active ? "#fff" : "#5a6a85",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function PageButton({ label, disabled, active, onClick }: { label: string; disabled?: boolean; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "5px 10px", fontSize: "12px", borderRadius: "6px", cursor: disabled ? "default" : "pointer",
        background: active ? "#1a1a1a" : "#fff",
        color: active ? "#fff" : disabled ? "#ccc" : "#5a6a85",
        border: `1px solid ${active ? "#1a1a1a" : "#dde3ed"}`,
        fontWeight: active ? 700 : 400,
      }}
    >
      {label}
    </button>
  );
}

function getPaginationRange(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [];
  pages.push(1);
  if (current > 3) pages.push("…");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push("…");
  pages.push(total);
  return pages;
}

const PAGE_SIZE = 50;

export default function RecentArticlesClient({
  subspecialties,
  specialties,
}: {
  subspecialties: string[];
  specialties: { value: string; label: string }[];
}) {
  const [period, setPeriod]           = useState<Period | null>(null);
  const [specialty, setSpecialty]     = useState(ACTIVE_SPECIALTY);
  const [selectedSubs, setSelectedSubs]   = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [page, setPage]               = useState(1);
  const [sortBy, setSortBy]           = useState<SortField>("published_date");
  const [sortDir, setSortDir]         = useState<"asc" | "desc">("desc");

  const [rows, setRows]       = useState<ArticleRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const fetchArticles = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("page", String(page));
    params.set("sort_by", sortBy);
    params.set("sort_dir", sortDir);
    if (specialty) params.set("specialty", specialty);
    if (selectedSubs.length > 0) params.set("subspecialty", selectedSubs.join(","));
    if (selectedTypes.length > 0) params.set("article_type", selectedTypes.join(","));
    if (period) {
      const { from, to } = getPubDateRange(period);
      params.set("pub_date_from", from);
      params.set("pub_date_to", to);
    }

    try {
      const res = await fetch(`/api/admin/articles?${params.toString()}`, { signal: ctrl.signal });
      const json = await res.json() as { ok: boolean; rows?: ArticleRow[]; total?: number; error?: string };
      if (json.ok) {
        setRows(json.rows ?? []);
        setTotal(json.total ?? 0);
      } else {
        setError(json.error ?? "Unknown error");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Fetch failed");
      }
    } finally {
      setLoading(false);
    }
  }, [period, specialty, selectedSubs, selectedTypes, page, sortBy, sortDir]);

  useEffect(() => {
    void fetchArticles();
  }, [fetchArticles]);

  function togglePeriod(p: Period) {
    setPeriod((prev) => (prev === p ? null : p));
    setPage(1);
  }

  function toggleSub(sub: string) {
    setSelectedSubs((prev) =>
      prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub]
    );
    setPage(1);
  }

  function toggleType(type: string) {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
    setPage(1);
  }

  function handleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(1);
  }

  function clearFilters() {
    setPeriod(null);
    setSpecialty(ACTIVE_SPECIALTY);
    setSelectedSubs([]);
    setSelectedTypes([]);
    setPage(1);
  }

  const hasActiveFilters = period !== null
    || specialty !== ACTIVE_SPECIALTY
    || selectedSubs.length > 0
    || selectedTypes.length > 0;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const thStyle: React.CSSProperties = {
    padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85",
    borderBottom: "1px solid #eef0f4", background: "#f8f9fb", whiteSpace: "nowrap",
    userSelect: "none",
  };

  const columns: { key: SortField; label: string }[] = [
    { key: "title",          label: "Title" },
    { key: "journal_abbr",   label: "Journal" },
    { key: "published_date", label: "Published" },
    { key: "article_type",   label: "Article type" },
  ];

  return (
    <div>
      {/* Filter panel */}
      <div style={{
        background: "#fff",
        borderRadius: "10px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
        padding: "16px 20px",
        marginBottom: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}>

        {/* Row 1: Period toggles + Specialty */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
              <PillButton key={p} label={PERIOD_LABELS[p]} active={period === p} onClick={() => togglePeriod(p)} />
            ))}
          </div>
          <select
            value={specialty}
            onChange={(e) => { setSpecialty(e.target.value); setSelectedSubs([]); setPage(1); }}
            style={{
              padding: "6px 10px", fontSize: "12px",
              border: "1px solid #dde3ed", borderRadius: "6px",
              background: "#fff", color: "#1a1a1a", cursor: "pointer", outline: "none",
            }}
          >
            {specialties.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Row 2: Subspeciality pills (only for active specialty) */}
        {specialty === ACTIVE_SPECIALTY && subspecialties.length > 0 && (
          <div>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
              Subspeciality
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {subspecialties.map((sub) => (
                <PillButton key={sub} label={sub} active={selectedSubs.includes(sub)} onClick={() => toggleSub(sub)} />
              ))}
            </div>
          </div>
        )}

        {/* Row 3: Article type pills */}
        <div>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
            Article type
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {ARTICLE_TYPES.map((type) => (
              <PillButton key={type} label={type} active={selectedTypes.includes(type)} onClick={() => toggleType(type)} />
            ))}
          </div>
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <div>
            <button
              onClick={clearFilters}
              style={{ fontSize: "12px", color: "#E83B2A", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{
        background: "#fff",
        borderRadius: "10px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
        overflow: "hidden",
      }}>
        <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#5a6a85" }}>
            {loading ? "Loading…" : `${total.toLocaleString("en-GB")} articles`}
          </span>
          {totalPages > 1 && (
            <span style={{ fontSize: "11px", color: "#888" }}>
              Page {page} of {totalPages}
            </span>
          )}
        </div>

        {error ? (
          <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#b91c1c" }}>
            Error: {error}
          </div>
        ) : loading ? (
          <div style={{ padding: "48px", textAlign: "center", fontSize: "13px", color: "#888" }}>
            Loading articles…
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", fontSize: "13px", color: "#888" }}>
            No articles match the current filters
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      style={{ ...thStyle, cursor: "pointer" }}
                    >
                      {col.label}
                      <SortArrow field={col.key} sortBy={sortBy} sortDir={sortDir} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((a, i) => {
                  const count = authorCount(a.authors);
                  return (
                    <tr key={a.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid #f1f3f7", maxWidth: "380px" }}>
                        <Link href={`/admin/articles/${a.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a", lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                            {a.title}
                          </div>
                          {count > 0 && (
                            <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>{count} authors</div>
                          )}
                        </Link>
                      </td>
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid #f1f3f7", fontSize: "12px", color: "#5a6a85", whiteSpace: "nowrap" }}>
                        {a.journal_abbr ?? "—"}
                      </td>
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid #f1f3f7", fontSize: "12px", color: "#5a6a85", whiteSpace: "nowrap" }}>
                        {fmt(a.published_date)}
                      </td>
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid #f1f3f7", fontSize: "12px", color: "#5a6a85", whiteSpace: "nowrap" }}>
                        {a.article_type ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div style={{ padding: "14px 20px", borderTop: "1px solid #eef0f4", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px" }}>
            <PageButton label="«" disabled={page === 1} onClick={() => setPage(1)} />
            <PageButton label="‹" disabled={page === 1} onClick={() => setPage(page - 1)} />
            {getPaginationRange(page, totalPages).map((p, i) =>
              p === "…" ? (
                <span key={`ellipsis-${i}`} style={{ padding: "5px 8px", fontSize: "12px", color: "#aaa" }}>…</span>
              ) : (
                <PageButton key={p} label={String(p)} active={p === page} onClick={() => setPage(p as number)} />
              )
            )}
            <PageButton label="›" disabled={page === totalPages} onClick={() => setPage(page + 1)} />
            <PageButton label="»" disabled={page === totalPages} onClick={() => setPage(totalPages)} />
          </div>
        )}
      </div>
    </div>
  );
}
