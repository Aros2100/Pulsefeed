"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { REGION_MAP, getContinent } from "@/lib/geo/continent-map";
import AuthorGeoFilter from "@/components/authors/AuthorGeoFilter";

const PAGE_SIZE = 50;

function titleCase(s: string): string {
  return s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const selectStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  padding: "10px 14px",
  fontSize: "14px",
  color: "#1a1a1a",
  background: "#fff",
  outline: "none",
  cursor: "pointer",
};

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
  created_at: string | null;
}

const IMPORTED_OPTIONS = [
  { value: "",     label: "Alle perioder" },
  { value: "7d",   label: "Seneste 7 dage" },
  { value: "30d",  label: "Seneste 30 dage" },
  { value: "90d",  label: "Seneste 3 måneder" },
  { value: "365d", label: "Seneste år" },
];

function importedCutoff(value: string): string | null {
  if (!value) return null;
  const days = parseInt(value, 10);
  return new Date(Date.now() - days * 86400000).toISOString();
}

export default function AdminAuthorsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const query          = searchParams.get("q")          ?? "";
  const continent      = searchParams.get("continent")  ?? "";
  const region         = searchParams.get("region")     ?? "";
  const country        = searchParams.get("country")    ?? "";
  const state          = searchParams.get("state")      ?? "";
  const city           = searchParams.get("city")       ?? "";
  const hospital       = searchParams.get("hospital")   ?? "";
  const geoSearch      = searchParams.get("geo_search") ?? "";
  const filterImported = searchParams.get("imported")   ?? "";
  const page           = parseInt(searchParams.get("page") ?? "0", 10);

  const [inputValue, setInputValue] = useState(query);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [userHospital, setUserHospital] = useState<string | null>(null);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    if (key !== "page") params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  // Sync inputValue → URL with 300ms debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setParam("q", inputValue);
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  // Keep inputValue in sync if URL changes externally (e.g. back/forward)
  useEffect(() => {
    setInputValue(query);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Fetch current user's hospital once on mount
  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: profile } = await supabase
        .from("users").select("author_id").eq("id", user.id).single();
      if (profile?.author_id) {
        const { data: author } = await supabase
          .from("authors").select("hospital").eq("id", profile.author_id).single();
        setUserHospital((author as { hospital?: string | null } | null)?.hospital ?? null);
      }
    });
  }, []);

  // Main data fetch
  useEffect(() => {
    const supabase = createClient();
    const from = page * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;
    setLoading(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let req: any = supabase
      .from("authors")
      .select("id, display_name, affiliations, article_count, author_score, created_at", { count: "exact" })
      .order("created_at", { ascending: false, nullsFirst: false })
      .range(from, to);

    if (query.trim().length >= 2) {
      req = req.ilike("display_name", `%${query.trim()}%`);
    }
    if (continent) {
      const cList = Object.entries(REGION_MAP)
        .filter(([, r]) => getContinent(r) === continent)
        .map(([c]) => titleCase(c));
      if (cList.length > 0) req = req.in("country", cList);
    }
    if (region) {
      const cList = Object.entries(REGION_MAP)
        .filter(([, r]) => r === region)
        .map(([c]) => titleCase(c));
      if (cList.length > 0) req = req.in("country", cList);
    }
    if (country)   req = req.eq("country", country);
    if (state)     req = req.eq("state", state);
    if (city)      req = req.eq("city", city);
    if (hospital)  req = req.ilike("hospital", `%${hospital}%`);
    if (geoSearch) req = req.or(
      `country.ilike.%${geoSearch}%,city.ilike.%${geoSearch}%,hospital.ilike.%${geoSearch}%`,
    );
    if (filterImported) {
      const cutoff = importedCutoff(filterImported);
      if (cutoff) req = req.gte("created_at", cutoff);
    }

    void (req as Promise<{ data: unknown; count: number | null }>).then(({ data, count }) => {
      setAuthors((data as unknown as Author[]) ?? []);
      setTotal(count ?? null);
      setLoading(false);
    });
  }, [query, page, continent, region, country, state, city, hospital, geoSearch, filterImported]);

  const totalPages = total !== null ? Math.ceil(total / PAGE_SIZE) : null;

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "26px", fontWeight: 700 }}>Authors</div>
          <div style={{ fontSize: "14px", color: "#888", marginTop: "4px" }}>
            {total !== null ? `${total.toLocaleString("da-DK")} forfattere i databasen` : "Browse researchers indexed in the database"}
          </div>
        </div>

        <div style={{ marginBottom: "12px" }}>
          <input
            type="text"
            placeholder="Search by name…"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box" as const,
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

        {/* Imported filter */}
        <div style={{ marginBottom: "12px" }}>
          <select
            value={filterImported}
            onChange={(e) => setParam("imported", e.target.value)}
            style={selectStyle}
          >
            {IMPORTED_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Geo filter */}
        <AuthorGeoFilter userHospital={userHospital} total={total} />

        <div style={{
          background: "#fff",
          borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}>
          <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase" as const, fontWeight: 700 }}>
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
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                    maxWidth: "600px",
                  }}>
                    {author.affiliations[0]}
                  </div>
                )}
              </div>
              <div style={{ marginLeft: "16px", flexShrink: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: "#aaa" }}>
                  {author.created_at ? new Date(author.created_at).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" }) : ""}
                </span>
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
                onClick={() => setParam("page", String(Math.max(0, page - 1)))}
                disabled={page === 0}
                style={{
                  fontSize: "13px", fontWeight: 600, padding: "6px 14px",
                  border: "1px solid #dde3ed", borderRadius: "6px", cursor: page === 0 ? "default" : "pointer",
                  background: "#fff", color: page === 0 ? "#bbb" : "#5a6a85",
                }}
              >
                ← Forrige
              </button>
              <span style={{ fontSize: "13px", color: "#5a6a85", minWidth: "80px", textAlign: "center" as const }}>
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setParam("page", String(Math.min(totalPages - 1, page + 1)))}
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
