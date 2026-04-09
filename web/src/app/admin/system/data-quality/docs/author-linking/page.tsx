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

export default function AuthorLinkingDocsPage() {
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
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Author Linking Pipeline</h1>
        </div>

        {/* Overview */}
        <div style={card}>
          <div style={sectionHeader}>
            <span style={sectionLabel}>Overview</span>
          </div>
          <div style={body}>
            <p style={{ margin: "0 0 12px" }}>
              Author linking køres efter import og matcher PubMed-forfattere til eksisterende eller nye <span style={mono}>authors</span>-rækker. Målet er at deduplere forfattere på tværs af artikler og berige dem med geo-data og OpenAlex-profiler.
            </p>
            <p style={{ margin: 0, color: "#374151" }}>
              Resultatet af hvert linking-run logges i <span style={mono}>author_linking_logs</span> med tællere for nye forfattere, matches, afviste og behandlede artikler.
            </p>
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
                <div style={stepTitle}>Artikel klar</div>
                <div style={{ color: "#374151" }}>
                  Artikel har forfatterliste fra PubMed XML med navn, affiliationstekster og eventuelt ORCID. Forfattere behandles i positionsrækkefølge — <span style={mono}>is_first_author</span> og <span style={mono}>is_last_author</span> markeres eksplicit.
                </div>
              </div>
            </div>

            <div style={stepRow}>
              <div style={stepNumber}>2</div>
              <div style={stepContent}>
                <div style={stepTitle}>OpenAlex match</div>
                <div style={{ color: "#374151" }}>
                  <span style={mono}>matchPubMedToOpenAlex()</span> matcher PubMed-forfattere mod OpenAlex via DOI eller titel. Returnerer <span style={mono}>OpenAlexAuthorship</span> med <span style={mono}>openalex_id</span>, ORCID og institution for hver forfatter der kan matches.
                </div>
              </div>
            </div>

            <div style={stepRow}>
              <div style={stepNumber}>3</div>
              <div style={stepContent}>
                <div style={stepTitle}>Forfatter resolution</div>
                <div style={{ color: "#374151", marginBottom: "8px" }}>
                  Fire strategier i prioriteret rækkefølge for at finde eller oprette den korrekte <span style={mono}>authors</span>-række:
                </div>
                <ol style={{ margin: "0 0 0 18px", padding: 0, color: "#374151" }}>
                  <li style={{ marginBottom: "4px" }}>Match på eksisterende <span style={mono}>openalex_id</span></li>
                  <li style={{ marginBottom: "4px" }}>Match på ORCID</li>
                  <li style={{ marginBottom: "4px" }}>Match på normaliseret navn + land (uden openalex_id)</li>
                  <li>Fallback: <span style={mono}>findOrCreateAuthor()</span> — navn-baseret dedup med geo-match</li>
                </ol>
              </div>
            </div>

            <div style={stepRow}>
              <div style={stepNumber}>4</div>
              <div style={stepContent}>
                <div style={stepTitle}>OpenAlex enrichment</div>
                <div style={{ color: "#374151", marginBottom: "6px" }}>
                  Ny eller matchet forfatter beriges med data fra OpenAlex: <span style={mono}>openalex_id</span>, institution, <span style={mono}>ror_id</span>, <span style={mono}>institution_type</span> og geo fra ROR API. Sætter <span style={mono}>geo_source = &apos;openalex&apos;</span> og <span style={mono}>verified_by = &apos;openalex&apos;</span>.
                </div>
                <div style={{ color: "#374151" }}>
                  Events: <span style={mono}>openalex_enriched</span>, <span style={mono}>openalex_fetched</span>.
                </div>
              </div>
            </div>

            <div style={stepRow}>
              <div style={stepNumber}>5</div>
              <div style={stepContent}>
                <div style={stepTitle}>Affiliation parsing (fallback)</div>
                <div style={{ color: "#374151", marginBottom: "6px" }}>
                  Hvis OpenAlex ikke leverer geo: <span style={mono}>lib/geo/affiliation-parser.ts</span> parses affiliationsteksten og udtrækker city, state, country og institution. <span style={mono}>normalizeGeo()</span> normaliserer by-navnet via <span style={mono}>city-map.ts</span> — mangler country, forsøger <span style={mono}>lookupCity()</span> som returnerer både kanonisk by og land.
                </div>
                <div style={{ color: "#374151", marginBottom: "6px" }}>
                  Match kræver fuldt navn + city + country. Svage match-branches er fjernet: branch 2c (merger på navn alene når eksisterende mangler geo), 2d (merger på navn alene når ny mangler geo) og 2.5 (initial-match på initialer) eksisterer ikke længere.
                </div>
                <div style={{ color: "#374151" }}>
                  Event: <span style={mono}>geo_parsed</span> med payload <span style={mono}>{"{ city, country, institution, source: \"parser\" }"}</span>.
                </div>
              </div>
            </div>

            <div style={stepRow}>
              <div style={stepNumber}>6</div>
              <div style={stepContent}>
                <div style={stepTitle}>article_authors skrives</div>
                <div style={{ color: "#374151" }}>
                  Forfatter-artikel-relationen gemmes i <span style={mono}>article_authors</span> med <span style={mono}>position</span>, <span style={mono}>is_first_author</span>, <span style={mono}>is_last_author</span> og den rå affiliationstekst fra PubMed.
                </div>
              </div>
            </div>

            <div style={{ ...stepRow, marginBottom: 0 }}>
              <div style={stepNumber}>7</div>
              <div style={stepContent}>
                <div style={stepTitle}>Forfatter-tæller opdateres</div>
                <div style={{ color: "#374151" }}>
                  <span style={mono}>authors.article_count</span> inkrementeres via databasetrigger for hvert nyt <span style={mono}>article_authors</span>-insert. Sikrer at tælleren altid afspejler det faktiske antal linkede artikler.
                </div>
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
              "lib/import/forfatter-import/find-or-create.ts",
              "lib/import/author-linker.ts",
              "lib/geo/normalize-geo.ts",
              "lib/geo/city-map.ts",
              "lib/geo/affiliation-parser.ts",
              "lib/openalex/match-authors.ts",
              "lib/author-events.ts",
              "app/api/admin/author-linking/start/route.ts",
            ].map((f) => (
              <span key={f} style={fileLink}>{f}</span>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
