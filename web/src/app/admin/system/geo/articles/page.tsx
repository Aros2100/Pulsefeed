import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Types ────────────────────────────────────────────────────────────────────

type Filter =
  | "high_confidence"
  | "low_confidence"
  | "unparsed"
  | "parsed"
  | "ai_attempted"
  | "ai_upgraded"
  | "ai_conflicted"
  | "ai_remaining";

interface Article {
  id: string;
  title: string;
  journal_title: string | null;
  published_date: string | null;
  geo_country: string | null;
  geo_city: string | null;
  geo_institution: string | null;
  location_confidence: string | null;
  ai_location_attempted: boolean | null;
}

const FILTERS: { key: Filter; label: string; bg: string; color: string; border: string }[] = [
  { key: "high_confidence", label: "High conf.", bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
  { key: "low_confidence", label: "Low conf.", bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  { key: "unparsed", label: "Ikke parset", bg: "#f9fafb", color: "#374151", border: "#d1d5db" },
  { key: "parsed", label: "Parset", bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  { key: "ai_attempted", label: "AI forsøgt", bg: "#f5f3ff", color: "#6d28d9", border: "#ddd6fe" },
  { key: "ai_upgraded", label: "AI opgraderet", bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
  { key: "ai_conflicted", label: "AI konflikter", bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  { key: "ai_remaining", label: "Afventer AI", bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
];

// ── Filter logic ─────────────────────────────────────────────────────────────

function applyFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filter: Filter,
) {
  switch (filter) {
    case "high_confidence":
      return query.eq("location_confidence", "high");
    case "low_confidence":
      return query.eq("location_confidence", "low");
    case "unparsed":
      return query.is("location_parsed_at", null).not("authors", "is", null).neq("authors", "[]");
    case "parsed":
      return query.not("location_parsed_at", "is", null);
    case "ai_attempted":
      return query.eq("ai_location_attempted", true);
    case "ai_upgraded":
      return query.eq("ai_location_attempted", true).eq("location_confidence", "high");
    case "ai_conflicted":
      return query.eq("ai_location_attempted", true).eq("location_confidence", "low");
    case "ai_remaining":
      return query.eq("location_confidence", "low").eq("ai_location_attempted", false);
    default:
      return query;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("da-DK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── Styles ───────────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: "10px 16px",
  textAlign: "left",
  fontSize: "11px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#5a6a85",
  borderBottom: "1px solid #eef0f4",
  background: "#f8f9fb",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: "13px",
  color: "#1a1a1a",
  borderBottom: "1px solid #f1f3f7",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function GeoArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: rawFilter } = await searchParams;
  const filter: Filter = FILTERS.some((f) => f.key === rawFilter)
    ? (rawFilter as Filter)
    : "high_confidence";

  const filterMeta = FILTERS.find((f) => f.key === filter)!;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const baseQuery = admin
    .from("articles")
    .select("id, title, journal_title, published_date, geo_country, geo_city, geo_institution, location_confidence, ai_location_attempted");

  const { data, error } = await applyFilter(baseQuery, filter)
    .order("published_date", { ascending: false, nullsFirst: false })
    .limit(200) as { data: Article[] | null; error: { message: string } | null };

  const articles = data ?? [];

  return (
    <div
      style={{
        fontFamily: "var(--font-inter), Inter, sans-serif",
        background: "#f5f7fa",
        color: "#1a1a1a",
        minHeight: "100vh",
      }}
    >
      <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "40px 24px 80px" }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px" }}>
          <Link
            href="/admin/system/import"
            style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}
          >
            ← Tilbage til import
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "24px" }}>
          <div
            style={{
              fontSize: "11px",
              letterSpacing: "0.08em",
              color: "#E83B2A",
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: "6px",
            }}
          >
            System · Geo-location
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
            Artikler — {filterMeta.label}
          </h1>
        </div>

        {/* Filter tabs */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            marginBottom: "24px",
          }}
        >
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <Link
                key={f.key}
                href={`/admin/system/geo/articles?filter=${f.key}`}
                style={{
                  textDecoration: "none",
                  padding: "6px 14px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: active ? f.bg : "#fff",
                  color: active ? f.color : "#5a6a85",
                  border: `1px solid ${active ? f.border : "#e5e7eb"}`,
                  transition: "all 0.15s",
                }}
              >
                {f.label}
              </Link>
            );
          })}
        </div>

        {/* Article count */}
        <div style={{ fontSize: "13px", color: "#5a6a85", marginBottom: "12px" }}>
          Viser {articles.length}{articles.length === 200 ? "+" : ""} artikler
        </div>

        {/* Table */}
        <div
          style={{
            background: "#fff",
            borderRadius: "10px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
            overflow: "hidden",
          }}
        >
          {error ? (
            <div style={{ padding: "24px", color: "#b91c1c" }}>
              Fejl: {error.message}
            </div>
          ) : articles.length === 0 ? (
            <div style={{ padding: "24px", color: "#5a6a85" }}>
              Ingen artikler fundet med dette filter.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Titel</th>
                  <th style={thStyle}>Journal</th>
                  <th style={thStyle}>Dato</th>
                  <th style={thStyle}>Land</th>
                  <th style={thStyle}>By</th>
                  <th style={thStyle}>Institution</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((a) => (
                  <tr key={a.id}>
                    <td style={{ ...tdStyle, maxWidth: "300px" }}>
                      <Link
                        href={`/admin/articles/${a.id}`}
                        style={{
                          color: "#1d4ed8",
                          textDecoration: "none",
                          fontWeight: 500,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {a.title}
                      </Link>
                    </td>
                    <td style={{ ...tdStyle, color: "#5a6a85", fontSize: "12px", whiteSpace: "nowrap" }}>
                      {a.journal_title ?? "—"}
                    </td>
                    <td style={{ ...tdStyle, color: "#5a6a85", fontSize: "12px", whiteSpace: "nowrap" }}>
                      {fmt(a.published_date)}
                    </td>
                    <td style={{ ...tdStyle, fontSize: "12px" }}>
                      {a.geo_country ?? <span style={{ color: "#ccc" }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, fontSize: "12px" }}>
                      {a.geo_city ?? <span style={{ color: "#ccc" }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, fontSize: "12px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.geo_institution ?? <span style={{ color: "#ccc" }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
                        {a.location_confidence && (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "1px 7px",
                              borderRadius: "999px",
                              fontSize: "10px",
                              fontWeight: 600,
                              background: a.location_confidence === "high" ? "#f0fdf4" : "#fff7ed",
                              color: a.location_confidence === "high" ? "#15803d" : "#c2410c",
                              border: `1px solid ${a.location_confidence === "high" ? "#bbf7d0" : "#fed7aa"}`,
                            }}
                          >
                            {a.location_confidence}
                          </span>
                        )}
                        {a.ai_location_attempted && (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "1px 7px",
                              borderRadius: "999px",
                              fontSize: "10px",
                              fontWeight: 600,
                              background: "#f5f3ff",
                              color: "#6d28d9",
                              border: "1px solid #ddd6fe",
                            }}
                          >
                            AI
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
