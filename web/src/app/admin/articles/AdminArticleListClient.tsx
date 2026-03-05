"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface ArticleRow {
  id: string;
  title: string;
  journal_abbr: string | null;
  published_date: string | null;
  imported_at: string;
  authors: unknown;
  status: string | null;
  circle: number | null;
  specialty_tags: string[];
  verified: boolean | null;
  abstract: string | null;
}

type SortField = "title" | "journal_abbr" | "published_date" | "imported_at" | "circle" | "status" | "verified";

interface Filters {
  search: string;
  circle: string;
  status: string;
  specialty: string;
  verified: string;
  has_abstract: string;
  date_from: string;
  date_to: string;
  sort_by: SortField;
  sort_dir: "asc" | "desc";
  page: number;
}

const PAGE_SIZE = 50;

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  approved: { bg: "#f0fdf4", color: "#15803d" },
  rejected:  { bg: "#fef2f2", color: "#b91c1c" },
  pending:   { bg: "#fffbeb", color: "#d97706" },
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("da-DK", { day: "2-digit", month: "short", year: "numeric" });
}

function authorCount(authors: unknown): number {
  return Array.isArray(authors) ? authors.length : 0;
}

function SortArrow({ field, sortBy, sortDir }: { field: SortField; sortBy: SortField; sortDir: "asc" | "desc" }) {
  if (field !== sortBy) return <span style={{ color: "#ccc", marginLeft: "4px" }}>↕</span>;
  return <span style={{ color: "#E83B2A", marginLeft: "4px" }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
}

function SelectFilter({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "6px 10px", fontSize: "12px", border: "1px solid #dde3ed",
        borderRadius: "6px", background: "#fff", color: value ? "#1a1a1a" : "#888",
        cursor: "pointer", outline: "none",
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export default function AdminArticleListClient() {
  const [filters, setFilters] = useState<Filters>({
    search: "", circle: "", status: "", specialty: "",
    verified: "", has_abstract: "", date_from: "", date_to: "",
    sort_by: "imported_at", sort_dir: "desc", page: 1,
  });
  const [rows, setRows] = useState<ArticleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [specialtyTags, setSpecialtyTags] = useState<string[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    void fetch("/api/admin/articles/specialty-tags")
      .then((r) => r.json() as Promise<{ ok: boolean; tags: string[] }>)
      .then((j) => { if (j.ok) setSpecialtyTags(j.tags); });
  }, []);

  const fetchArticles = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("page", String(f.page));
    params.set("limit", String(PAGE_SIZE));
    params.set("sort_by", f.sort_by);
    params.set("sort_dir", f.sort_dir);
    if (f.search)      params.set("search", f.search);
    if (f.circle)      params.set("circle", f.circle);
    if (f.status)      params.set("status", f.status);
    if (f.specialty)   params.set("specialty", f.specialty);
    if (f.verified)    params.set("verified", f.verified);
    if (f.has_abstract) params.set("has_abstract", f.has_abstract);
    if (f.date_from)   params.set("date_from", f.date_from);
    if (f.date_to)     params.set("date_to", f.date_to);

    try {
      const res = await fetch(`/api/admin/articles?${params.toString()}`);
      const json = await res.json() as { ok: boolean; rows?: ArticleRow[]; total?: number; error?: string };
      if (json.ok) {
        setRows(json.rows ?? []);
        setTotal(json.total ?? 0);
      } else {
        setError(json.error ?? "Unknown error");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchArticles(filters);
  }, [filters, fetchArticles]);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value, page: key !== "page" ? 1 : (value as number) }));
  }

  function handleSearchChange(v: string) {
    setSearchInput(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: v, page: 1 }));
    }, 350);
  }

  function handleSort(field: SortField) {
    setFilters((prev) => ({
      ...prev,
      sort_by: field,
      sort_dir: prev.sort_by === field && prev.sort_dir === "desc" ? "asc" : "desc",
      page: 1,
    }));
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const { sort_by, sort_dir, page } = filters;

  const thStyle: React.CSSProperties = {
    padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85",
    borderBottom: "1px solid #eef0f4", background: "#f8f9fb", whiteSpace: "nowrap",
    userSelect: "none",
  };

  const columns: { key: SortField; label: string; sortable?: boolean }[] = [
    { key: "title",        label: "Titel",       sortable: true },
    { key: "journal_abbr", label: "Tidsskrift",   sortable: true },
    { key: "published_date", label: "Publiceret", sortable: true },
    { key: "imported_at",  label: "Importeret",   sortable: true },
    { key: "circle",       label: "Circle",       sortable: true },
    { key: "status",       label: "Status",       sortable: true },
    { key: "verified",     label: "Verificeret",  sortable: true },
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
        flexDirection: "column",
        gap: "10px",
      }}>
        {/* Row 1: search + core filters */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Søg titel eller tidsskrift…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            style={{
              flex: "1 1 200px", padding: "7px 12px",
              border: "1px solid #dde3ed", borderRadius: "6px",
              fontSize: "13px", outline: "none",
            }}
          />
          <SelectFilter
            value={filters.circle}
            onChange={(v) => setFilter("circle", v)}
            placeholder="Circle: Alle"
            options={[
              { value: "1", label: "Circle 1" },
              { value: "2", label: "Circle 2" },
              { value: "3", label: "Circle 3" },
            ]}
          />
          <SelectFilter
            value={filters.status}
            onChange={(v) => setFilter("status", v)}
            placeholder="Status: Alle"
            options={[
              { value: "pending",  label: "Afventer" },
              { value: "approved", label: "Godkendt" },
              { value: "rejected", label: "Afvist" },
            ]}
          />
          <SelectFilter
            value={filters.specialty}
            onChange={(v) => setFilter("specialty", v)}
            placeholder="Specialty: Alle"
            options={specialtyTags.map((t) => ({ value: t, label: t }))}
          />
        </div>
        {/* Row 2: extra filters */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <SelectFilter
            value={filters.verified}
            onChange={(v) => setFilter("verified", v)}
            placeholder="Verificeret: Alle"
            options={[
              { value: "true",  label: "Verificeret" },
              { value: "false", label: "Ikke verificeret" },
            ]}
          />
          <SelectFilter
            value={filters.has_abstract}
            onChange={(v) => setFilter("has_abstract", v)}
            placeholder="Abstract: Alle"
            options={[
              { value: "true",  label: "Har abstract" },
              { value: "false", label: "Mangler abstract" },
            ]}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "#888" }}>Fra</span>
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => setFilter("date_from", e.target.value)}
              style={{ padding: "5px 8px", fontSize: "12px", border: "1px solid #dde3ed", borderRadius: "6px", outline: "none" }}
            />
            <span style={{ fontSize: "12px", color: "#888" }}>Til</span>
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => setFilter("date_to", e.target.value)}
              style={{ padding: "5px 8px", fontSize: "12px", border: "1px solid #dde3ed", borderRadius: "6px", outline: "none" }}
            />
          </div>
          {(filters.circle || filters.status || filters.specialty || filters.verified || filters.has_abstract || filters.date_from || filters.date_to || filters.search) && (
            <button
              onClick={() => {
                setSearchInput("");
                setFilters({ search: "", circle: "", status: "", specialty: "", verified: "", has_abstract: "", date_from: "", date_to: "", sort_by: "imported_at", sort_dir: "desc", page: 1 });
              }}
              style={{ fontSize: "12px", color: "#E83B2A", background: "none", border: "none", cursor: "pointer", padding: "5px 0", textDecoration: "underline" }}
            >
              Ryd filtre
            </button>
          )}
        </div>
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
            {loading ? "Henter…" : `${total.toLocaleString("da-DK")} artikler`}
          </span>
          {totalPages > 1 && (
            <span style={{ fontSize: "11px", color: "#888" }}>
              Side {page} af {totalPages}
            </span>
          )}
        </div>

        {error ? (
          <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "#b91c1c" }}>
            Fejl: {error}
          </div>
        ) : loading ? (
          <div style={{ padding: "48px", textAlign: "center", fontSize: "13px", color: "#888" }}>
            Henter artikler…
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", fontSize: "13px", color: "#888" }}>
            Ingen artikler matcher filteret
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => col.sortable && handleSort(col.key)}
                      style={{ ...thStyle, cursor: col.sortable ? "pointer" : "default" }}
                    >
                      {col.label}
                      {col.sortable && <SortArrow field={col.key} sortBy={sort_by} sortDir={sort_dir} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((a, i) => {
                  const st = a.status ?? "pending";
                  const s = STATUS_STYLE[st] ?? STATUS_STYLE.pending;
                  const count = authorCount(a.authors);
                  return (
                    <tr
                      key={a.id}
                      style={{ background: i % 2 === 0 ? "#fff" : "#fafbfc" }}
                    >
                      {/* Title */}
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid #f1f3f7", maxWidth: "340px" }}>
                        <Link href={`/admin/articles/${a.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a", lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                            {a.title}
                          </div>
                          {count > 0 && (
                            <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>{count} forfattere</div>
                          )}
                        </Link>
                      </td>
                      {/* Journal */}
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid #f1f3f7", fontSize: "12px", color: "#5a6a85", whiteSpace: "nowrap" }}>
                        {a.journal_abbr ?? "—"}
                      </td>
                      {/* Published */}
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid #f1f3f7", fontSize: "12px", color: "#5a6a85", whiteSpace: "nowrap" }}>
                        {fmt(a.published_date)}
                      </td>
                      {/* Imported */}
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid #f1f3f7", fontSize: "12px", color: "#5a6a85", whiteSpace: "nowrap" }}>
                        {fmt(a.imported_at)}
                      </td>
                      {/* Circle */}
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid #f1f3f7", fontSize: "12px", color: "#5a6a85", whiteSpace: "nowrap" }}>
                        {a.circle != null ? `C${a.circle}` : "—"}
                      </td>
                      {/* Status */}
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid #f1f3f7" }}>
                        <span style={{ fontSize: "11px", fontWeight: 600, borderRadius: "999px", padding: "2px 8px", background: s.bg, color: s.color }}>
                          {st}
                        </span>
                      </td>
                      {/* Verified */}
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid #f1f3f7", fontSize: "12px", whiteSpace: "nowrap" }}>
                        {a.verified === true ? (
                          <span style={{ color: "#15803d", fontWeight: 600 }}>✓</span>
                        ) : (
                          <span style={{ color: "#ccc" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div style={{ padding: "14px 20px", borderTop: "1px solid #eef0f4", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px" }}>
            <PageButton label="«" disabled={page === 1} onClick={() => setFilter("page", 1)} />
            <PageButton label="‹" disabled={page === 1} onClick={() => setFilter("page", page - 1)} />
            {getPaginationRange(page, totalPages).map((p, i) =>
              p === "…" ? (
                <span key={`ellipsis-${i}`} style={{ padding: "5px 8px", fontSize: "12px", color: "#aaa" }}>…</span>
              ) : (
                <PageButton key={p} label={String(p)} active={p === page} onClick={() => setFilter("page", p as number)} />
              )
            )}
            <PageButton label="›" disabled={page === totalPages} onClick={() => setFilter("page", page + 1)} />
            <PageButton label="»" disabled={page === totalPages} onClick={() => setFilter("page", totalPages)} />
          </div>
        )}
      </div>
    </div>
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
