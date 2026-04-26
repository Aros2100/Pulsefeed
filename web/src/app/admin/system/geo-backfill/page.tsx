import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { GeoBackfillActions } from "./_components/GeoBackfillActions";

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
  padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.06em", color: "#5a6a85",
  borderBottom: "1px solid #eef0f4", background: "#f8f9fb",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px", fontSize: "13px", color: "#1a1a1a",
  borderBottom: "1px solid #f1f3f7",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface RunSummary {
  run_id: string;
  previewed: number;
  created_at: string;
  changed_country: number;
  changed_city: number;
  changed_institution: number;
  ror_count: number;
  parser_openalex_count: number;
  parser_pubmed_count: number;
  null_count: number;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("da-DK", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function GeoBackfillPage() {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = admin as any;

  // Aggregate per run_id
  const { data: rawRows } = await a
    .from("geo_backfill_preview")
    .select("run_id, new_geo_source, old_geo_country, new_geo_country, old_geo_city, new_geo_city, old_geo_institution, new_geo_institution, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);

  const rows = (rawRows ?? []) as {
    run_id: string;
    new_geo_source: string | null;
    old_geo_country: string | null;
    new_geo_country: string | null;
    old_geo_city: string | null;
    new_geo_city: string | null;
    old_geo_institution: string | null;
    new_geo_institution: string | null;
    created_at: string;
  }[];

  // Group by run_id
  const runMap = new Map<string, RunSummary>();
  for (const row of rows) {
    if (!runMap.has(row.run_id)) {
      runMap.set(row.run_id, {
        run_id: row.run_id,
        previewed: 0,
        created_at: row.created_at,
        changed_country: 0,
        changed_city: 0,
        changed_institution: 0,
        ror_count: 0,
        parser_openalex_count: 0,
        parser_pubmed_count: 0,
        null_count: 0,
      });
    }
    const s = runMap.get(row.run_id)!;
    s.previewed++;
    if (row.old_geo_country !== row.new_geo_country) s.changed_country++;
    if (row.old_geo_city !== row.new_geo_city) s.changed_city++;
    if (row.old_geo_institution !== row.new_geo_institution) s.changed_institution++;
    if (row.new_geo_source === "ror_enriched") s.ror_count++;
    else if (row.new_geo_source === "parser_openalex") s.parser_openalex_count++;
    else if (row.new_geo_source === "parser_pubmed") s.parser_pubmed_count++;
    else s.null_count++;
    if (row.created_at < s.created_at) s.created_at = row.created_at;
  }

  const runs = Array.from(runMap.values()).sort(
    (a, b) => b.created_at.localeCompare(a.created_at)
  );

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
            ← System
          </Link>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "36px" }}>
          <div style={{
            fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A",
            textTransform: "uppercase", fontWeight: 700, marginBottom: "6px",
          }}>
            System · Geo
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Geo Backfill — Dry-run</h1>
          <p style={{ fontSize: "13px", color: "#5a6a85", marginTop: "8px" }}>
            Preview den nye geo-logik (ROR → parser_openalex → parser_pubmed) på 200 tilfældige artikler uden at ændre databasen.
          </p>
        </div>

        {/* Trigger */}
        <div style={sectionCard}>
          <div style={sectionHeader}>
            <span style={headerLabel}>Ny kørsel</span>
          </div>
          <div style={{ padding: "20px 24px" }}>
            <GeoBackfillActions />
          </div>
        </div>

        {/* Previous runs */}
        {runs.length > 0 && (
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <span style={headerLabel}>Tidligere kørsler</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Dato", "Previewed", "Land ændret", "By ændret", "Inst. ændret", "ROR", "OA parser", "PubMed parser", "Null", ""].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map(run => (
                    <tr key={run.run_id}>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#5a6a85" }}>{fmt(run.created_at)}</td>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{run.previewed}</td>
                      <td style={{ ...tdStyle, color: run.changed_country > 0 ? "#dc2626" : "#888" }}>{run.changed_country}</td>
                      <td style={{ ...tdStyle, color: run.changed_city > 0 ? "#d97706" : "#888" }}>{run.changed_city}</td>
                      <td style={{ ...tdStyle }}>{run.changed_institution}</td>
                      <td style={{ ...tdStyle, color: "#15803d", fontWeight: run.ror_count > 0 ? 600 : 400 }}>{run.ror_count}</td>
                      <td style={{ ...tdStyle }}>{run.parser_openalex_count}</td>
                      <td style={{ ...tdStyle }}>{run.parser_pubmed_count}</td>
                      <td style={{ ...tdStyle, color: run.null_count > 0 ? "#888" : "#1a1a1a" }}>{run.null_count}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <Link
                          href={`/admin/system/geo-backfill/${run.run_id}`}
                          style={{ fontSize: "13px", fontWeight: 600, color: "#E83B2A", textDecoration: "none" }}
                        >
                          Se diff →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {runs.length === 0 && (
          <div style={{ ...sectionCard, padding: "40px 24px", textAlign: "center", color: "#5a6a85", fontSize: "14px" }}>
            Ingen tidligere kørsler. Tryk &quot;Kør dry-run&quot; for at starte.
          </div>
        )}

      </div>
    </div>
  );
}
