import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";

// ── Styles ────────────────────────────────────────────────────────────────────

const sectionCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: "10px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
  overflow: "hidden",
  marginBottom: "28px",
};

const sectionHeader: React.CSSProperties = {
  background: "#EEF2F7",
  borderBottom: "1px solid #dde3ed",
  padding: "10px 20px",
};

const headerLabel: React.CSSProperties = {
  fontSize: "11px", letterSpacing: "0.08em",
  textTransform: "uppercase", fontWeight: 700, color: "#5a6a85",
};

const thStyle: React.CSSProperties = {
  padding: "8px 12px", textAlign: "left", fontSize: "11px", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85",
  borderBottom: "1px solid #eef0f4", background: "#f8f9fb", whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px", fontSize: "12px", color: "#1a1a1a",
  borderBottom: "1px solid #f1f3f7", verticalAlign: "top",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface PreviewRow {
  id: string;
  article_id: string;
  run_id: string;
  old_geo_department: string | null;
  old_geo_institution: string | null;
  old_geo_city: string | null;
  old_geo_state: string | null;
  old_geo_country: string | null;
  old_geo_region: string | null;
  old_geo_continent: string | null;
  old_geo_parser_confidence: string | null;
  new_geo_department: string | null;
  new_geo_institution: string | null;
  new_geo_city: string | null;
  new_geo_state: string | null;
  new_geo_country: string | null;
  new_geo_region: string | null;
  new_geo_continent: string | null;
  new_geo_source: string | null;
  new_geo_parser_confidence: string | null;
  had_openalex_cached: boolean;
  openalex_fetched: boolean;
  ror_lookup_attempted: boolean;
  ror_lookup_succeeded: boolean;
  parser_fallback_used: boolean;
  created_at: string;
}

function diff(oldVal: string | null, newVal: string | null) {
  const unchanged = oldVal === newVal;
  const oldDisplay = oldVal ?? <span style={{ color: "#9ca3af" }}>null</span>;
  const newDisplay = newVal ?? <span style={{ color: "#9ca3af" }}>null</span>;

  if (unchanged) {
    return <span style={{ color: "#374151" }}>{oldDisplay}</span>;
  }
  return (
    <span>
      <span style={{ color: "#9ca3af", textDecoration: "line-through", marginRight: "4px" }}>{oldDisplay}</span>
      <span style={{ color: "#15803d", fontWeight: 600 }}>{newDisplay}</span>
    </span>
  );
}

function SourceBadge({ source }: { source: string | null }) {
  const styles: Record<string, { bg: string; text: string }> = {
    ror_enriched:     { bg: "#dcfce7", text: "#15803d" },
    parser_openalex:  { bg: "#dbeafe", text: "#1d4ed8" },
    parser_pubmed:    { bg: "#f3e8ff", text: "#7c3aed" },
  };
  const s = source ? (styles[source] ?? { bg: "#f3f4f6", text: "#374151" }) : { bg: "#f3f4f6", text: "#9ca3af" };
  return (
    <span style={{
      fontSize: "10px", fontWeight: 700, borderRadius: "4px", padding: "2px 6px",
      background: s.bg, color: s.text,
    }}>
      {source ?? "null"}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function GeoBackfillRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = admin as any;

  const { data, error } = await a
    .from("geo_backfill_preview")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error || !data || data.length === 0) notFound();
  const rows = data as PreviewRow[];

  // ── Aggregate stats ──────────────────────────────────────────────────────────
  const total = rows.length;
  const unchanged = rows.filter(r =>
    r.old_geo_city === r.new_geo_city && r.old_geo_country === r.new_geo_country
  ).length;
  const changedCountry = rows.filter(r => r.old_geo_country !== r.new_geo_country).length;
  const changedCity = rows.filter(r => r.old_geo_city !== r.new_geo_city).length;
  const changedInstitution = rows.filter(r => r.old_geo_institution !== r.new_geo_institution).length;
  const rorCount = rows.filter(r => r.new_geo_source === "ror_enriched").length;
  const oaCount = rows.filter(r => r.new_geo_source === "parser_openalex").length;
  const pmCount = rows.filter(r => r.new_geo_source === "parser_pubmed").length;
  const nullCount = rows.filter(r => !r.new_geo_source).length;
  const nullGeo = rows.filter(r => !r.new_geo_country && !r.new_geo_city).length;
  const oaFailed = rows.filter(r => r.ror_lookup_attempted && !r.openalex_fetched).length;
  const parserToRor = rows.filter(r =>
    r.new_geo_source === "ror_enriched" &&
    (r.old_geo_country != null || r.old_geo_city != null)
  ).length;
  const nullToSomething = rows.filter(r =>
    !r.old_geo_country && !r.old_geo_city &&
    (r.new_geo_country != null || r.new_geo_city != null)
  ).length;

  const runDate = new Date(rows[0].created_at).toLocaleString("da-DK", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system/geo-backfill" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← Geo Backfill
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "36px" }}>
          <div style={{
            fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A",
            textTransform: "uppercase", fontWeight: 700, marginBottom: "6px",
          }}>
            System · Geo · Dry-run diff
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
            Kørsel {runDate}
          </h1>
          <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px", fontFamily: "monospace" }}>
            run_id: {runId}
          </div>
        </div>

        {/* Aggregated summary */}
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Sammenfatning</span>
          </div>
          <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
            {[
              { label: "Total previewed",    value: total,              color: "#1a1a1a" },
              { label: "Uændret (city+land)", value: unchanged,         color: unchanged === total ? "#15803d" : "#1a1a1a" },
              { label: "Land ændret",         value: changedCountry,    color: changedCountry > 0 ? "#dc2626" : "#888" },
              { label: "By ændret",           value: changedCity,       color: changedCity > 0 ? "#d97706" : "#888" },
              { label: "Institution ændret",  value: changedInstitution, color: "#1a1a1a" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "#f8f9fb", borderRadius: "8px", padding: "14px 16px" }}>
                <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "4px" }}>{label}</div>
                <div style={{ fontSize: "22px", fontWeight: 800, color }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid #eef0f4", padding: "20px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
            <div style={{ background: "#f0fdf4", borderRadius: "8px", padding: "14px 16px" }}>
              <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "4px" }}>ROR</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#15803d" }}>{rorCount}</div>
            </div>
            <div style={{ background: "#eff6ff", borderRadius: "8px", padding: "14px 16px" }}>
              <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "4px" }}>OA parser</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#1d4ed8" }}>{oaCount}</div>
            </div>
            <div style={{ background: "#faf5ff", borderRadius: "8px", padding: "14px 16px" }}>
              <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "4px" }}>PubMed parser</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#7c3aed" }}>{pmCount}</div>
            </div>
            <div style={{ background: "#f9fafb", borderRadius: "8px", padding: "14px 16px" }}>
              <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "4px" }}>Null geo</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: nullGeo > 0 ? "#9ca3af" : "#1a1a1a" }}>{nullCount}</div>
            </div>
            <div style={{ background: "#f0fdf4", borderRadius: "8px", padding: "14px 16px" }}>
              <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "4px" }}>Parser → ROR</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#15803d" }}>{parserToRor}</div>
            </div>
            <div style={{ background: "#f0fdf4", borderRadius: "8px", padding: "14px 16px" }}>
              <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "4px" }}>Null → noget</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#15803d" }}>{nullToSomething}</div>
            </div>
            <div style={{ background: "#fff7ed", borderRadius: "8px", padding: "14px 16px" }}>
              <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "4px" }}>OA-kald fejlet</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: oaFailed > 0 ? "#d97706" : "#1a1a1a" }}>{oaFailed}</div>
            </div>
          </div>
        </div>

        {/* Diff table — show only changed rows first, then rest */}
        {[
          { title: "Ændrede rækker", filter: (r: PreviewRow) => r.old_geo_city !== r.new_geo_city || r.old_geo_country !== r.new_geo_country },
          { title: "Uændrede rækker", filter: (r: PreviewRow) => r.old_geo_city === r.new_geo_city && r.old_geo_country === r.new_geo_country },
        ].map(({ title, filter }) => {
          const filtered = rows.filter(filter);
          if (filtered.length === 0) return null;
          return (
            <div key={title} style={sectionCard}>
              <div style={sectionHeader}>
                <span style={headerLabel}>{title} ({filtered.length})</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Artikel", "Kilde", "Land", "By", "Institution", "State", "OA?", "ROR?"].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(row => (
                      <tr key={row.id}>
                        <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "11px", color: "#5a6a85" }}>
                          <Link
                            href={`/admin/articles/${row.article_id}`}
                            style={{ color: "#5a6a85", textDecoration: "none" }}
                          >
                            {row.article_id.slice(0, 8)}…
                          </Link>
                        </td>
                        <td style={tdStyle}>
                          <SourceBadge source={row.new_geo_source} />
                        </td>
                        <td style={tdStyle}>{diff(row.old_geo_country, row.new_geo_country)}</td>
                        <td style={tdStyle}>{diff(row.old_geo_city, row.new_geo_city)}</td>
                        <td style={tdStyle}>{diff(row.old_geo_institution, row.new_geo_institution)}</td>
                        <td style={tdStyle}>{diff(row.old_geo_state, row.new_geo_state)}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          {row.openalex_fetched ? "✓" : <span style={{ color: "#9ca3af" }}>—</span>}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          {row.ror_lookup_succeeded ? <span style={{ color: "#15803d" }}>✓</span>
                            : row.ror_lookup_attempted ? <span style={{ color: "#dc2626" }}>✗</span>
                            : <span style={{ color: "#9ca3af" }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

      </div>
    </div>
  );
}
