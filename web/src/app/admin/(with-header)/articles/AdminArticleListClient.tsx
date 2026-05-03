"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ACTIVE_SPECIALTY } from "@/lib/auth/specialties";

type Period = "today" | "week" | "month" | "year" | "last_year";

const PERIOD_LABELS: Record<Period, string> = {
  today:     "24H",
  week:      "This week",
  month:     "This month",
  year:      "This year",
  last_year: "Last year",
};

function getPubDateRange(period: Period): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  if (period === "today") {
    const from = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    return { from: from.toISOString().slice(0, 10), to };
  }
  if (period === "week") {
    const d = new Date(today);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return { from: d.toISOString().slice(0, 10), to };
  }
  if (period === "month") {
    return { from: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`, to };
  }
  if (period === "last_year") {
    const y = today.getFullYear() - 1;
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return { from: `${today.getFullYear()}-01-01`, to };
}

function PillButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px", fontSize: "12px",
        fontWeight: active ? 700 : 400,
        borderRadius: "20px",
        border: `1px solid ${active ? "var(--pf-dark)" : "var(--color-border-tertiary)"}`,
        background: active ? "var(--pf-dark)" : "var(--pf-white)",
        color: active ? "var(--pf-white)" : "var(--color-text-secondary)",
        cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

interface ArticleRow {
  id: string;
  title: string;
  journal_abbr: string | null;
  pubmed_indexed_at: string | null;
  imported_at: string;
  authors: unknown;
  circle: number | null;
  specialty_tags: string[];
  abstract: string | null;
  article_type: string | null;
  subspecialty: string[] | null;
}

type SortField = "title" | "journal_abbr" | "pubmed_indexed_at" | "imported_at" | "circle";

interface Filters {
  search: string;
  mesh_term: string;
  specialty: string;
  subspecialty: string;
  article_type: string;
  geo_continent: string;
  geo_region: string;
  geo_country: string;
  geo_state: string;
  geo_city: string;
  no_region:      boolean;
  no_country:     boolean;
  no_state:       boolean;
  no_city:        boolean;
  not_parsed:     boolean;
  suspect_city:   boolean;
  no_subspecialty: boolean;
  specialty_excluded: boolean;
  no_abstract: boolean;
  sort_by: SortField;
  sort_dir: "asc" | "desc";
  page: number;
  period: Period | null;
}

const PAGE_SIZE = 50;

// Hardcoded — independent of DB
const CONTINENTS = [
  "Africa",
  "Asia",
  "Europe",
  "North America",
  "Oceania",
  "South America",
] as const;


function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("da-DK", { day: "2-digit", month: "short", year: "numeric" });
}

function authorCount(authors: unknown): number {
  return Array.isArray(authors) ? authors.length : 0;
}

function SortArrow({ field, sortBy, sortDir }: { field: SortField; sortBy: SortField; sortDir: "asc" | "desc" }) {
  if (field !== sortBy) return <span style={{ color: "#ccc", marginLeft: "4px" }}>↕</span>;
  return <span style={{ color: "var(--pf-red)", marginLeft: "4px" }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
}

function SelectFilter({ value, onChange, options, placeholder, disabled }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  disabled?: boolean;
}) {
  const active = !!value && !disabled;
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        padding: "6px 8px",
        fontSize: "12px",
        border: `1px solid ${disabled ? "var(--color-background-secondary)" : active ? "var(--pf-red)" : "var(--color-border-tertiary)"}`,
        borderRadius: "6px",
        background: active ? "var(--pf-red)" : disabled ? "var(--pf-surface)" : "var(--pf-white)",
        color: disabled ? "#bbb" : active ? "var(--pf-white)" : "var(--color-text-secondary)",
        cursor: disabled ? "default" : "pointer",
        outline: "none",
        fontWeight: active ? 700 : 400,
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

const SORT_FIELDS = ["title", "journal_abbr", "pubmed_indexed_at", "imported_at", "circle"] as const;

function filtersFromParams(sp: URLSearchParams): Filters {
  const sortBy = sp.get("sort_by") ?? "imported_at";
  const sortDir = sp.get("sort_dir") ?? "desc";
  return {
    search:          sp.get("search")          ?? "",
    mesh_term:       sp.get("mesh_term")       ?? "",
    specialty:       sp.get("specialty")       ?? ACTIVE_SPECIALTY,
    subspecialty:    sp.get("subspecialty")    ?? "",
    article_type:    sp.get("article_type")    ?? "",
    geo_continent:   sp.get("geo_continent")   ?? "",
    geo_region:      sp.get("geo_region")      ?? "",
    geo_country:     sp.get("geo_country")     ?? "",
    geo_state:       sp.get("geo_state")       ?? "",
    geo_city:        sp.get("geo_city")        ?? "",
    no_region:        sp.get("no_region")        === "true",
    no_country:       sp.get("no_country")       === "true",
    no_state:         sp.get("no_state")         === "true",
    no_city:          sp.get("no_city")          === "true",
    not_parsed:       sp.get("not_parsed")       === "true",
    suspect_city:     sp.get("suspect_city")     === "true",
    no_subspecialty:   sp.get("no_subspecialty")   === "true",
    specialty_excluded: sp.get("specialty_excluded") === "true",
    no_abstract:       sp.get("no_abstract")       === "true",
    sort_by:         (SORT_FIELDS as readonly string[]).includes(sortBy) ? sortBy as SortField : "imported_at",
    sort_dir:        sortDir === "asc" ? "asc" : "desc",
    page:            Math.max(1, parseInt(sp.get("page") ?? "1", 10)),
    period: (["today","week","month","year","last_year"].includes(sp.get("period") ?? "")) ? sp.get("period") as Period : null,
  };
}

function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.search)          p.set("search",          f.search);
  if (f.mesh_term)       p.set("mesh_term",       f.mesh_term);
  if (f.specialty)       p.set("specialty",       f.specialty);
  if (f.subspecialty)    p.set("subspecialty",    f.subspecialty);
  if (f.article_type)    p.set("article_type",    f.article_type);
  if (f.geo_continent)   p.set("geo_continent",   f.geo_continent);
  if (f.geo_region)      p.set("geo_region",      f.geo_region);
  if (f.geo_country)     p.set("geo_country",     f.geo_country);
  if (f.geo_state)       p.set("geo_state",       f.geo_state);
  if (f.geo_city)        p.set("geo_city",        f.geo_city);
  if (f.no_region)        p.set("no_region",        "true");
  if (f.no_country)       p.set("no_country",       "true");
  if (f.no_state)         p.set("no_state",         "true");
  if (f.no_city)          p.set("no_city",          "true");
  if (f.not_parsed)       p.set("not_parsed",       "true");
  if (f.suspect_city)     p.set("suspect_city",     "true");
  if (f.no_subspecialty)   p.set("no_subspecialty",   "true");
  if (f.specialty_excluded) p.set("specialty_excluded", "true");
  if (f.no_abstract)       p.set("no_abstract",       "true");
  if (f.sort_by !== "imported_at") p.set("sort_by", f.sort_by);
  if (f.sort_dir !== "desc")       p.set("sort_dir", f.sort_dir);
  if (f.page > 1)                  p.set("page", String(f.page));
  if (f.period) p.set("period", f.period);
  return p;
}

const EMPTY_FILTERS: Filters = {
  search: "", mesh_term: "", specialty: ACTIVE_SPECIALTY, subspecialty: "", article_type: "",
  geo_continent: "", geo_region: "", geo_country: "", geo_state: "", geo_city: "",
  no_region: false, no_country: false, no_state: false, no_city: false, not_parsed: false, suspect_city: false, no_subspecialty: false, specialty_excluded: false, no_abstract: false,
  sort_by: "imported_at", sort_dir: "desc", page: 1,
  period: null,
};

export default function AdminArticleListClient({
  subspecialties,
  specialties,
}: {
  subspecialties: string[];
  specialties: { value: string; label: string }[];
}) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [filters, setFiltersState] = useState<Filters>(() => filtersFromParams(searchParams));
  const [rows, setRows] = useState<ArticleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchInput, setSearchInput] = useState(() => searchParams.get("search") ?? "");
  const [meshInput, setMeshInput] = useState(() => searchParams.get("mesh_term") ?? "");
  const [geoRegions, setGeoRegions] = useState<string[]>([]);
  const [geoCountries, setGeoCountries] = useState<string[]>([]);
  const [geoStates, setGeoStates] = useState<string[]>([]);
  const [geoCities, setGeoCities] = useState<string[]>([]);

  const fetchArticles = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    const params = filtersToParams(f);
    if (f.period) {
      const { from, to } = getPubDateRange(f.period);
      params.set("pub_date_from", from);
      params.set("pub_date_to", to);
    }
    params.set("page", String(f.page));
    params.set("limit", String(PAGE_SIZE));
    params.set("sort_by", f.sort_by);
    params.set("sort_dir", f.sort_dir);

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
    const qs = filtersToParams(filters).toString();
    router.replace(`?${qs}`, { scroll: false });
  }, [filters, fetchArticles, router]);

  // Reload region list when continent changes
  useEffect(() => {
    const params = new URLSearchParams({ field: "geo_region" });
    if (filters.geo_continent) params.set("continent", filters.geo_continent);
    fetch(`/api/admin/articles/geo-options?${params}`)
      .then((r) => r.json())
      .then((d: { ok: boolean; options?: string[] }) => {
        if (d.ok) setGeoRegions(d.options ?? []);
      })
      .catch(() => {});
  }, [filters.geo_continent]);

  // Reload country list when continent or region changes
  useEffect(() => {
    const params = new URLSearchParams({ field: "geo_country" });
    if (filters.geo_continent) params.set("continent", filters.geo_continent);
    if (filters.geo_region)    params.set("region",    filters.geo_region);
    fetch(`/api/admin/articles/geo-options?${params}`)
      .then((r) => r.json())
      .then((d: { ok: boolean; options?: string[] }) => {
        if (d.ok) setGeoCountries(d.options ?? []);
      })
      .catch(() => {});
  }, [filters.geo_continent, filters.geo_region]);

  // Reload state list when country changes; clear when no country selected
  useEffect(() => {
    if (!filters.geo_country) { setGeoStates([]); return; }
    const params = new URLSearchParams({ field: "geo_state", country: filters.geo_country });
    fetch(`/api/admin/articles/geo-options?${params}`)
      .then((r) => r.json())
      .then((d: { ok: boolean; options?: string[] }) => {
        if (d.ok) setGeoStates(d.options ?? []);
      })
      .catch(() => { setGeoStates([]); });
  }, [filters.geo_country]);

  // Reload city list when country (or state) changes; clear when no country selected
  useEffect(() => {
    if (!filters.geo_country) { setGeoCities([]); return; }
    const params = new URLSearchParams({ field: "geo_city", country: filters.geo_country });
    if (filters.geo_state) params.set("state", filters.geo_state);
    fetch(`/api/admin/articles/geo-options?${params}`)
      .then((r) => r.json())
      .then((d: { ok: boolean; options?: string[] }) => {
        if (d.ok) setGeoCities(d.options ?? []);
      })
      .catch(() => { setGeoCities([]); });
  }, [filters.geo_country, filters.geo_state]);

  /** Set any filter; geo parents cascade-clear their children. */
  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFiltersState((prev) => {
      const next: Filters = { ...prev, [key]: value, page: key !== "page" ? 1 : (value as number) };
      if (key === "geo_continent") { next.geo_region = ""; next.geo_country = ""; next.geo_state = ""; next.geo_city = ""; }
      if (key === "geo_region")    { next.geo_country = ""; next.geo_state = ""; next.geo_city = ""; }
      if (key === "geo_country")   { next.geo_state = ""; next.geo_city = ""; }
      if (key === "geo_state")     { next.geo_city = ""; }
      if (key === "specialty") { next.subspecialty = ""; next.no_subspecialty = false; next.specialty_excluded = false; }
      if (key === "subspecialty" && value) { next.no_subspecialty = false; }
      if (key === "no_subspecialty" && value) { next.subspecialty = ""; next.specialty_excluded = false; }
      if (key === "specialty_excluded" && value) { next.no_subspecialty = false; }
      return next;
    });
  }

  function handleSearchChange(v: string) {
    setSearchInput(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setFiltersState((prev) => ({ ...prev, search: v, page: 1 }));
    }, 350);
  }

  function handleMeshChange(v: string) {
    setMeshInput(v);
    if (meshTimer.current) clearTimeout(meshTimer.current);
    meshTimer.current = setTimeout(() => {
      setFiltersState((prev) => ({ ...prev, mesh_term: v, page: 1 }));
    }, 350);
  }

  function handleSort(field: SortField) {
    setFiltersState((prev) => ({
      ...prev,
      sort_by: field,
      sort_dir: prev.sort_by === field && prev.sort_dir === "desc" ? "asc" : "desc",
      page: 1,
    }));
  }

  function setPeriod(p: Period | null) {
    setFiltersState((prev) => ({ ...prev, period: p, page: 1 }));
  }

  const hasActiveFilters = !!(
    filters.subspecialty || filters.no_subspecialty || filters.specialty_excluded || filters.no_abstract || filters.article_type || filters.search ||
    filters.mesh_term || filters.geo_continent || filters.geo_region || filters.geo_country || filters.geo_state ||
    filters.geo_city
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const { sort_by, sort_dir, page } = filters;

  const thStyle: React.CSSProperties = {
    padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-secondary)",
    borderBottom: "1px solid var(--color-background-secondary)", background: "var(--pf-surface)", whiteSpace: "nowrap",
    userSelect: "none",
  };

  const columns: { key: SortField; label: string; sortable?: boolean }[] = [
    { key: "title",          label: "Title",     sortable: true },
    { key: "pubmed_indexed_at", label: "PubMed date", sortable: true },
  ];

  const sectionLabel: React.CSSProperties = {
    fontSize: "10px", fontWeight: 700, color: "#9ca3af",
    textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px",
  };

  return (
    <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>

      {/* Sidebar */}
      <div style={{
        width: "180px", flexShrink: 0,
        background: "var(--pf-white)", borderRadius: "10px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
        padding: "16px", display: "flex", flexDirection: "column", gap: "20px",
      }}>

        {/* Specialty */}
        <div>
          <div style={sectionLabel}>Specialty</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <SelectFilter
              value={filters.specialty}
              onChange={(v) => setFilter("specialty", v)}
              placeholder="Specialty"
              options={specialties}
            />
            <SelectFilter
              value={filters.subspecialty}
              onChange={(v) => setFilter("subspecialty", v)}
              placeholder="Subspecialty"
              options={subspecialties.map((t) => ({ value: t, label: t }))}
              disabled={filters.specialty !== ACTIVE_SPECIALTY}
            />
            {filters.specialty === ACTIVE_SPECIALTY && !filters.subspecialty && (
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", marginTop: "2px" }}>
                <input
                  type="checkbox"
                  checked={filters.no_subspecialty}
                  onChange={(e) => setFilter("no_subspecialty", e.target.checked)}
                  style={{ accentColor: "var(--pf-red)", cursor: "pointer" }}
                />
                <span style={{ fontSize: "11px", color: filters.no_subspecialty ? "var(--pf-red)" : "var(--color-text-secondary)", fontWeight: filters.no_subspecialty ? 700 : 400 }}>
                  No subspecialty
                </span>
              </label>
            )}
            {filters.specialty && (
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", marginTop: "2px" }}>
                <input
                  type="checkbox"
                  checked={filters.specialty_excluded}
                  onChange={(e) => setFilter("specialty_excluded", e.target.checked)}
                  style={{ accentColor: "var(--pf-red)", cursor: "pointer" }}
                />
                <span style={{ fontSize: "11px", color: filters.specialty_excluded ? "var(--pf-red)" : "var(--color-text-secondary)", fontWeight: filters.specialty_excluded ? 700 : 400 }}>
                  Excluded only
                </span>
              </label>
            )}
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--color-background-secondary)" }} />

        {/* Location */}
        <div>
          <div style={sectionLabel}>Location</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <SelectFilter
              value={filters.geo_continent}
              onChange={(v) => setFilter("geo_continent", v)}
              placeholder="Continent"
              options={CONTINENTS.map((c) => ({ value: c, label: c }))}
            />
            <SelectFilter
              value={filters.geo_region}
              onChange={(v) => setFilter("geo_region", v)}
              placeholder="Region"
              options={geoRegions.map((r) => ({ value: r, label: r }))}
              disabled={!filters.geo_continent}
            />
            <SelectFilter
              value={filters.geo_country}
              onChange={(v) => setFilter("geo_country", v)}
              placeholder="Country"
              options={geoCountries.map((c) => ({ value: c, label: c }))}
              disabled={!filters.geo_continent}
            />
            <SelectFilter
              value={filters.geo_state}
              onChange={(v) => setFilter("geo_state", v)}
              placeholder="State"
              options={geoStates.map((s) => ({ value: s, label: s }))}
              disabled={!filters.geo_country}
            />
            <SelectFilter
              value={filters.geo_city}
              onChange={(v) => setFilter("geo_city", v)}
              placeholder="City"
              options={geoCities.map((c) => ({ value: c, label: c }))}
              disabled={!filters.geo_country}
            />
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--color-background-secondary)" }} />

        {/* Article type */}
        <div>
          <div style={sectionLabel}>Article type</div>
          <SelectFilter
            value={filters.article_type}
            onChange={(v) => setFilter("article_type", v)}
            placeholder="All types"
            options={[
              { value: "Meta-analysis",            label: "Meta-analysis" },
              { value: "Review",                   label: "Review" },
              { value: "Intervention study",       label: "Intervention study" },
              { value: "Non-interventional study", label: "Non-interventional study" },
              { value: "Basic study",              label: "Basic study" },
              { value: "Case",                     label: "Case" },
              { value: "Guideline",                label: "Guideline" },
              { value: "Technique & Technology",   label: "Technique & Technology" },
              { value: "Administration",           label: "Administration" },
              { value: "Letters & Notices",        label: "Letters & Notices" },
              { value: "Unclassified",             label: "Unclassified" },
            ]}
          />
        </div>

        <div style={{ borderTop: "1px solid var(--color-background-secondary)" }} />

        {/* Content */}
        <div>
          <div style={sectionLabel}>Content</div>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={filters.no_abstract}
              onChange={(e) => setFilter("no_abstract", e.target.checked)}
              style={{ accentColor: "var(--pf-red)", cursor: "pointer" }}
            />
            <span style={{ fontSize: "11px", color: filters.no_abstract ? "var(--pf-red)" : "var(--color-text-secondary)", fontWeight: filters.no_abstract ? 700 : 400 }}>
              No abstract
            </span>
          </label>
        </div>

        {hasActiveFilters && (
          <>
            <div style={{ borderTop: "1px solid var(--color-background-secondary)" }} />
            <button
              onClick={() => { setSearchInput(""); setMeshInput(""); setFiltersState(EMPTY_FILTERS); }}
              style={{
                width: "100%", padding: "6px", fontSize: "12px", borderRadius: "6px",
                border: "1px solid #fecaca", background: "#fef2f2",
                color: "#b91c1c", cursor: "pointer", fontWeight: 600,
              }}
            >
              Clear filters
            </button>
          </>
        )}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Search + Period bar */}
        <div style={{
          background: "var(--pf-white)", borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          marginBottom: "12px", padding: "12px 16px",
          display: "flex", flexDirection: "column", gap: "10px",
        }}>
          {/* Period toggle row — segmented control */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={{
              display: "inline-flex",
              border: "1px solid var(--color-border-tertiary)",
              borderRadius: "8px",
              overflow: "hidden",
              background: "var(--color-background-secondary)",
            }}>
              {([
                { label: "24H",        value: "today"     },
                { label: "This week",  value: "week"      },
                { label: "This month", value: "month"     },
                { label: "This year",  value: "year"      },
                { label: "Last year",  value: "last_year" },
                { label: "All",        value: null        },
              ] as { label: string; value: Period | null }[]).map(({ label, value }, i, arr) => {
                const active = filters.period === value;
                return (
                  <button
                    key={label}
                    onClick={() => setPeriod(value)}
                    style={{
                      padding: "6px 14px",
                      fontSize: "10px",
                      fontWeight: active ? 700 : 500,
                      border: "none",
                      borderRight: i < arr.length - 1 ? "1px solid var(--color-border-tertiary)" : "none",
                      background: active ? "var(--pf-red)" : "transparent",
                      color: active ? "var(--pf-white)" : "var(--color-text-secondary)",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      transition: "background 0.12s ease, color 0.12s ease",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search inputs row */}
          <div style={{ display: "flex", gap: "10px" }}>
            <input
              type="text"
              placeholder="Search title, abstract or PMID…"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              style={{
                flex: 2, padding: "7px 12px",
                border: "1px solid var(--color-border-tertiary)", borderRadius: "20px",
                fontSize: "13px", outline: "none", boxSizing: "border-box",
              }}
            />
            <MeshAutocomplete value={meshInput} onChange={handleMeshChange} />
          </div>
        </div>

        {/* Table */}
        <div style={{
          background: "var(--pf-white)", borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}>
          <div style={{ background: "var(--color-background-secondary)", borderBottom: "1px solid var(--color-border-tertiary)", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>
              {loading ? "Loading…" : `${total.toLocaleString("da-DK")} articles`}
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
                    const count = authorCount(a.authors);
                    return (
                      <tr key={a.id} style={{ background: i % 2 === 0 ? "var(--pf-white)" : "var(--pf-surface)" }}>
                        <td style={{ padding: "11px 14px", borderBottom: "1px solid #f1f3f7", maxWidth: "340px" }}>
                          <Link href={`/admin/articles/${a.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--pf-dark)", lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                              {a.title}
                            </div>
                            {(count > 0 || a.article_type || (a.subspecialty && a.subspecialty.length > 0)) && (
                              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px", marginTop: "4px" }}>
                                {count > 0 && (
                                  <span style={{ fontSize: "11px", color: "#aaa" }}>{count} authors</span>
                                )}
                                {a.article_type && (
                                  <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "8px", background: "#f0f2f5", color: "#5a6a85", fontWeight: 600 }}>
                                    {a.article_type}
                                  </span>
                                )}
                                {(a.subspecialty ?? []).map((s) => (
                                  <span key={s} style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "8px", background: "#f5f3ff", color: "#6d28d9", fontWeight: 600 }}>
                                    {s}
                                  </span>
                                ))}
                              </div>
                            )}
                          </Link>
                        </td>
                        <td style={{ padding: "11px 14px", borderBottom: "1px solid #f1f3f7", fontSize: "12px", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                          {fmt(a.pubmed_indexed_at ?? null)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && totalPages > 1 && (
            <div style={{ padding: "14px 20px", borderTop: "1px solid var(--color-background-secondary)", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px" }}>
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
    </div>
  );
}

function MeshAutocomplete({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [options, setOptions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleInput(v: string) {
    onChange(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.length < 2) { setOptions([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/admin/articles/mesh-terms?q=${encodeURIComponent(v)}`);
      const d = await r.json() as { ok: boolean; terms?: string[] };
      if (d.ok) { setOptions(d.terms ?? []); setOpen(true); }
    }, 300);
  }

  return (
    <div style={{ position: "relative", flex: 1 }}>
      <input
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="MeSH term…"
        style={{ width: "100%", padding: "7px 12px", border: "1px solid var(--color-border-tertiary)", borderRadius: "20px", fontSize: "13px", outline: "none", boxSizing: "border-box" }}
      />
      {open && options.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--pf-white)", border: "1px solid var(--color-border-tertiary)", borderRadius: "6px", zIndex: 100, maxHeight: "200px", overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
          {options.map((t) => (
            <div key={t} onMouseDown={() => { onChange(t); setOpen(false); }}
              style={{ padding: "8px 12px", fontSize: "12px", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-background-secondary)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              {t}
            </div>
          ))}
        </div>
      )}
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
        background: active ? "var(--pf-dark)" : "var(--pf-white)",
        color: active ? "var(--pf-white)" : disabled ? "#ccc" : "var(--color-text-secondary)",
        border: `1px solid ${active ? "var(--pf-dark)" : "var(--color-border-tertiary)"}`,
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
