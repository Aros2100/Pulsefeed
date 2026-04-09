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

export default function ArticleGeoDocsPage() {
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
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Article geo pipeline</h1>
        </div>

        {/* Overview */}
        <div style={card}>
          <div style={sectionHeader}>
            <span style={sectionLabel}>Overview</span>
          </div>
          <div style={body}>
            <p style={{ margin: "0 0 12px" }}>
              Geo-data på artikler er udelukkende baseret på <strong>første-forfatter affiliationstekst</strong> — dvs. den rå affiliationsstreng fra PubMed for den forfatter der er listet først.
            </p>
            <p style={{ margin: "0 0 12px" }}>
              Geo-hierarkiet fra finkornet til grovkornet:
            </p>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", fontSize: "13px" }}>
              {[
                "geo_department",
                "geo_institution",
                "geo_city",
                "geo_state",
                "geo_country",
                "geo_region",
                "geo_continent",
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
                <div style={stepTitle}>Import</div>
                <div style={{ color: "#374151" }}>
                  PubMed-affiliation hentes fra første forfatter (<span style={mono}>position = 1</span> i <span style={mono}>article_authors</span>). Rå tekst gemmes i <span style={mono}>articles.authors</span> JSONB-feltet.
                </div>
              </div>
            </div>

            <div style={stepRow}>
              <div style={stepNumber}>2</div>
              <div style={stepContent}>
                <div style={stepTitle}>Parser</div>
                <div style={{ color: "#374151", marginBottom: "6px" }}>
                  <span style={mono}>lib/geo/affiliation-parser.ts</span> ekstraherer city og country fra rå affiliationstekst via deterministiske regler:
                </div>
                <ol style={{ margin: "0 0 0 18px", padding: 0, color: "#374151" }}>
                  <li style={{ marginBottom: "4px" }}>Normaliser kommaer og strip email + postnummer</li>
                  <li style={{ marginBottom: "4px" }}>Ekstraher <strong>country</strong> fra sidst segment — valideret mod kanonisk landeliste</li>
                  <li style={{ marginBottom: "4px" }}>Ekstraher <strong>city</strong> fra næstsidste segment — valideret mod GeoNames (989 KB city-set)</li>
                  <li>Ekstraher <strong>institution</strong> og <strong>department</strong> fra øvrige segmenter</li>
                </ol>
              </div>
            </div>

            <div style={stepRow}>
              <div style={stepNumber}>3</div>
              <div style={stepContent}>
                <div style={stepTitle}>City normalisering</div>
                <div style={{ color: "#374151" }}>
                  <span style={mono}>lib/geo/city-aliases.ts</span> — <span style={mono}>resolveCityAlias()</span> slår op i <span style={mono}>city_aliases</span>-tabellen med 286.000+ GeoNames-baserede varianter. Eksempler: <em>München → Munich</em>, <em>København → Copenhagen</em>, <em>Köln → Cologne</em>.
                </div>
              </div>
            </div>

            <div style={stepRow}>
              <div style={stepNumber}>4</div>
              <div style={stepContent}>
                <div style={stepTitle}>State lookup</div>
                <div style={{ color: "#374151" }}>
                  <span style={mono}>lib/geo/state-map.ts</span> — <span style={mono}>lookupState(city, country)</span>. Statisk tabel over byer med kendt delstat, primært USA.
                </div>
              </div>
            </div>

            <div style={stepRow}>
              <div style={stepNumber}>5</div>
              <div style={stepContent}>
                <div style={stepTitle}>Region + continent</div>
                <div style={{ color: "#374151" }}>
                  <span style={mono}>lib/geo/country-map.ts</span> — <span style={mono}>getRegion(country)</span> og <span style={mono}>getContinent(country)</span>. Dækker ~190 lande inkl. territorier (Hong Kong, Taiwan, Puerto Rico, Curaçao, New Caledonia, Greenland m.fl.).
                </div>
              </div>
            </div>

            <div style={stepRow}>
              <div style={stepNumber}>6</div>
              <div style={stepContent}>
                <div style={stepTitle}>DB-normalisering</div>
                <div style={{ color: "#374151" }}>
                  <span style={mono}>normalize_geo_city()</span> PostgreSQL-funktion køres automatisk efter hvert import og renser resterende garbage-værdier i <span style={mono}>geo_city</span> via alias-opslag.
                </div>
              </div>
            </div>

            <div style={{ ...stepRow, marginBottom: 0 }}>
              <div style={stepNumber}>7</div>
              <div style={stepContent}>
                <div style={stepTitle}>geo_source</div>
                <div style={{ color: "#374151" }}>
                  Sættes til <span style={mono}>affiliation_parser</span> (PubMed-tekst) eller <span style={mono}>institution_map</span> (ROR/OpenAlex institution-opslag).
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
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "10px 16px", fontSize: "14px" }}>
              <div style={{ fontWeight: 700 }}>Country · State</div>
              <div style={{ color: "#374151" }}>Strukturelt kontrollerede via kanoniske lister — altid rene værdier.</div>
              <div style={{ fontWeight: 700 }}>City</div>
              <div style={{ color: "#374151" }}>
                Fri tekst fra affiliationsstreng — kan indeholde garbage (postnumre, gadenumre, forkortelser). Overvåges løbende via{" "}
                <Link href="/admin/system/data-quality" style={{ color: "#E83B2A", textDecoration: "none" }}>
                  data-quality siden
                </Link>
                {" "}(sektion 5 · City coverage).
              </div>
            </div>
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
              "lib/geo/affiliation-utils.ts",
              "lib/geo/city-aliases.ts",
              "lib/geo/country-map.ts",
              "lib/geo/state-map.ts",
              "scripts/seed-city-aliases-from-geonames.ts",
            ].map((f) => (
              <span key={f} style={fileLink}>{f}</span>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
