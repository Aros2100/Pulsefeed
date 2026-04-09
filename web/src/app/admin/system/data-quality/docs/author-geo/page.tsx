import Link from "next/link";

// ── Styles ────────────────────────────────────────────────────────────────────

const SHADOW = "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)";

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "10px",
  boxShadow: SHADOW,
  overflow: "hidden",
  marginBottom: "20px",
};

const sectionHeader: React.CSSProperties = {
  background: "#EEF2F7",
  borderBottom: "1px solid #dde3ed",
  padding: "10px 20px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const sectionLabel: React.CSSProperties = {
  fontSize: "11px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  fontWeight: 700,
  color: "#5a6a85",
};

const body: React.CSSProperties = {
  padding: "20px 24px",
  fontSize: "14px",
  lineHeight: "1.65",
  color: "#1a1a1a",
};

const stepNumber: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "22px",
  height: "22px",
  borderRadius: "50%",
  background: "#E83B2A",
  color: "#fff",
  fontSize: "11px",
  fontWeight: 700,
  flexShrink: 0,
  marginTop: "1px",
};

const stepRow: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  marginBottom: "16px",
  alignItems: "flex-start",
};

const stepContent: React.CSSProperties = {
  flex: 1,
};

const stepTitle: React.CSSProperties = {
  fontWeight: 700,
  marginBottom: "3px",
};

const mono: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: "12px",
  background: "#f1f3f7",
  borderRadius: "4px",
  padding: "1px 5px",
  color: "#374151",
};

const fileLink: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: "12px",
  color: "#5a6a85",
  textDecoration: "none",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuthorGeoDocsPage() {
  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px", display: "flex", gap: "6px", fontSize: "13px", color: "#5a6a85" }}>
          <Link href="/admin/system" style={{ color: "#5a6a85", textDecoration: "none" }}>← System</Link>
          <span>·</span>
          <Link href="/admin/system/data-quality" style={{ color: "#5a6a85", textDecoration: "none" }}>Data quality</Link>
        </div>

        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            System · Docs
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Author geo pipeline</h1>
        </div>

        {/* Overview */}
        <div style={card}>
          <div style={sectionHeader}>
            <span style={sectionLabel}>Overview</span>
          </div>
          <div style={body}>
            <p style={{ margin: "0 0 12px" }}>
              Geo-data på forfattere akkumuleres over flere trin — fra rå affiliationstekst ved import til autoritativ data fra ROR API og manuelle verifikationer.
            </p>
            <p style={{ margin: "0 0 12px" }}>
              Geo-hierarkiet fra finkornet til grovkornet:
            </p>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", fontSize: "13px" }}>
              {[
                "city",
                "state",
                "country",
                "region",
                "continent",
              ].map((field, i, arr) => (
                <span key={field} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={mono}>{field}</span>
                  {i < arr.length - 1 && <span style={{ color: "#94a3b8" }}>→</span>}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Pipeline steps */}
        <div style={card}>
          <div style={sectionHeader}>
            <span style={sectionLabel}>Pipeline-trin</span>
          </div>
          <div style={body}>

            <div style={stepRow}>
              <div style={stepNumber}>1</div>
              <div style={stepContent}>
                <div style={stepTitle}>Import & author linking</div>
                <div style={{ color: "#374151" }}>
                  Forfatter oprettes ved import. Affiliationstekst fra PubMed gemmes på <span style={mono}>article_authors</span>. Ved linking oprettes forfatterpost i <span style={mono}>authors</span>. Event: <span style={mono}>created</span>.
                </div>
              </div>
            </div>

            <div style={stepRow}>
              <div style={stepNumber}>2</div>
              <div style={stepContent}>
                <div style={stepTitle}>Affiliation parsing</div>
                <div style={{ color: "#374151", marginBottom: "6px" }}>
                  <span style={mono}>lib/geo/affiliation-parser.ts</span> parses affiliationsteksten og udtrækker institution, city, state og country via deterministiske regler. Resultatet skrives direkte til <span style={mono}>authors</span>.
                </div>
                <div style={{ color: "#374151" }}>
                  Event: <span style={mono}>geo_parsed</span> med payload <span style={mono}>{"{ city, country, institution, source: \"parser\" }"}</span>.
                </div>
              </div>
            </div>

            <div style={stepRow}>
              <div style={stepNumber}>3</div>
              <div style={stepContent}>
                <div style={stepTitle}>OpenAlex enrichment</div>
                <div style={{ color: "#374151", marginBottom: "6px" }}>
                  OpenAlex-profil hentes for forfattere med openalex_id. Geo opdateres fra <span style={mono}>last_known_institution</span> — city, state, country og <span style={mono}>ror_id</span> skrives til <span style={mono}>authors</span>.
                </div>
                <div style={{ color: "#374151" }}>
                  Event: <span style={mono}>openalex_enriched</span>.
                </div>
              </div>
            </div>

            <div style={stepRow}>
              <div style={stepNumber}>4</div>
              <div style={stepContent}>
                <div style={stepTitle}>ROR normalisering</div>
                <div style={{ color: "#374151", marginBottom: "6px" }}>
                  <span style={mono}>scripts/normalize-ror-geo.ts</span> henter autoritativ geo fra ROR API via <span style={mono}>ror_id</span>. Overskriver city, state og country med kanoniske GeoNames-værdier. Springer forfattere over med <span style={mono}>verified_by = &apos;human&apos;</span>.
                </div>
                <div style={{ color: "#374151" }}>
                  Event: <span style={mono}>geo_updated</span> med payload <span style={mono}>{"{ source: \"ror\", ...changes }"}</span>.
                </div>
              </div>
            </div>

            <div style={stepRow}>
              <div style={stepNumber}>5</div>
              <div style={stepContent}>
                <div style={stepTitle}>City normalisering</div>
                <div style={{ color: "#374151", marginBottom: "6px" }}>
                  <span style={mono}>normalize_author_geo_city()</span> PostgreSQL-funktion renser garbage-værdier (Cedex, postnumre, forkortelser) og anvender <span style={mono}>city_aliases</span>-tabellen med 286.000+ GeoNames-baserede varianter. Springer forfattere over med <span style={mono}>verified_by = &apos;human&apos;</span>.
                </div>
                <div style={{ color: "#374151" }}>
                  Event: <span style={mono}>geo_updated</span> med payload <span style={mono}>{"{ source: \"normalize_city\", rows_updated: N }"}</span> (bulk-event, <span style={mono}>author_id = null</span>).
                </div>
              </div>
            </div>

            <div style={stepRow}>
              <div style={stepNumber}>6</div>
              <div style={stepContent}>
                <div style={stepTitle}>Region & kontinent backfill</div>
                <div style={{ color: "#374151", marginBottom: "6px" }}>
                  <span style={mono}>scripts/backfill-author-region-continent.ts</span> udleder <span style={mono}>region</span> og <span style={mono}>continent</span> fra <span style={mono}>country</span> via <span style={mono}>getRegion()</span> og <span style={mono}>getContinent()</span> fra <span style={mono}>lib/geo/country-map.ts</span>. Dækker ~190 lande inkl. territorier. Springer forfattere over med <span style={mono}>verified_by = &apos;human&apos;</span>.
                </div>
                <div style={{ color: "#374151" }}>
                  Event: <span style={mono}>geo_updated</span> med payload <span style={mono}>{"{ source: \"backfill\", region, continent }"}</span>.
                </div>
              </div>
            </div>

            <div style={{ ...stepRow, marginBottom: 0 }}>
              <div style={stepNumber}>7</div>
              <div style={stepContent}>
                <div style={stepTitle}>Manuel verifikation</div>
                <div style={{ color: "#374151" }}>
                  Lab-interface eller admin-redigering sætter <span style={mono}>verified_by = &apos;human&apos;</span>. Forfattere med denne markering må <strong>aldrig</strong> overskrives af automatiserede processer. Event: <span style={mono}>geo_updated</span> med payload <span style={mono}>{"{ source: \"human\" }"}</span>.
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Data quality */}
        <div style={card}>
          <div style={sectionHeader}>
            <span style={sectionLabel}>Datakvalitet</span>
          </div>
          <div style={body}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: "6px 12px 8px 0", fontWeight: 700, color: "#374151" }}>Felt</th>
                  <th style={{ textAlign: "left", padding: "6px 12px 8px",   fontWeight: 700, color: "#374151" }}>Kilde</th>
                  <th style={{ textAlign: "right", padding: "6px 0 8px 12px", fontWeight: 700, color: "#374151" }}>Dækning</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { field: "city",      source: "Parser / OpenAlex / ROR", pct: "98.2%" },
                  { field: "state",     source: "Parser / OpenAlex / ROR", pct: "89.7%" },
                  { field: "country",   source: "Parser / OpenAlex / ROR", pct: "98.3%" },
                  { field: "region",    source: "Backfill fra country",    pct: "95.1%" },
                  { field: "continent", source: "Backfill fra country",    pct: "95.1%" },
                ].map((row, i) => (
                  <tr key={row.field} style={{ borderBottom: i < 4 ? "1px solid #f1f3f7" : "none" }}>
                    <td style={{ padding: "7px 12px 7px 0" }}><span style={mono}>{row.field}</span></td>
                    <td style={{ padding: "7px 12px",     color: "#374151" }}>{row.source}</td>
                    <td style={{ padding: "7px 0 7px 12px", textAlign: "right", fontWeight: 600 }}>{row.pct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Key files */}
        <div style={card}>
          <div style={sectionHeader}>
            <span style={sectionLabel}>Nøglefiler</span>
          </div>
          <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {[
              "lib/geo/affiliation-parser.ts",
              "lib/geo/city-aliases.ts",
              "lib/geo/country-map.ts",
              "lib/author-linker.ts",
              "scripts/normalize-ror-geo.ts",
              "scripts/backfill-author-region-continent.ts",
            ].map((f) => (
              <span key={f} style={fileLink}>{f}</span>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
