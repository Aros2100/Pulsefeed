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

export default function PubmedImportDocsPage() {
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
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>PubMed Import Pipeline</h1>
        </div>

        {/* Overview */}
        <div style={card}>
          <div style={sectionHeader}>
            <span style={sectionLabel}>Overview</span>
          </div>
          <div style={body}>
            <p style={{ margin: "0 0 12px" }}>
              PubMed-import kører dagligt kl. 02:00 UTC via Vercel cron. Hvert filter i <span style={mono}>pubmed_filters</span>-tabellen kører som en selvstændig job med sin egen <span style={mono}>import_log</span>-række.
            </p>
            <p style={{ margin: "0 0 12px" }}>
              Systemet opererer i tre circles med forskellig godkendelseslogik:
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "6px 12px", fontSize: "13px" }}>
              <span style={mono}>Circle 1</span>
              <span style={{ color: "#374151" }}>Betroede tidsskrifter — artikler godkendes automatisk (<span style={mono}>status = approved</span>, <span style={mono}>approval_method = journal</span>)</span>
              <span style={mono}>Circle 2</span>
              <span style={{ color: "#374151" }}>Affiliationsbaserede søgninger — artikler kræver manuel godkendelse (<span style={mono}>status = pending</span>)</span>
              <span style={mono}>Circle 3</span>
              <span style={{ color: "#374151" }}>Danske hospitaler — artikler kræver manuel godkendelse (<span style={mono}>status = pending</span>)</span>
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
                <div style={stepTitle}>PubMed filter hentes</div>
                <div style={{ color: "#374151" }}>
                  <span style={mono}>pubmed_filters</span>-tabellen indeholder søgeforespørgsler per circle og specialty. Hvert filter køres separat som en uafhængig import-job med sin egen <span style={mono}>import_logs</span>-række til sporing af status, timing og fejl.
                </div>
              </div>
            </div>

            <div style={stepRow}>
              <div style={stepNumber}>2</div>
              <div style={stepContent}>
                <div style={stepTitle}>ESearch</div>
                <div style={{ color: "#374151" }}>
                  PubMed Entrez ESearch API kaldes med filter-query. Returnerer en liste af PMIDs for artikler publiceret inden for det konfigurerede tidsvindue. Rate limit: ~9 requests/sekund via <span style={mono}>PUBMED_API_KEY</span>.
                </div>
              </div>
            </div>

            <div style={stepRow}>
              <div style={stepNumber}>3</div>
              <div style={stepContent}>
                <div style={stepTitle}>Deduplicate</div>
                <div style={{ color: "#374151" }}>
                  PMIDs tjekkes mod eksisterende <span style={mono}>articles.pubmed_id</span> i chunks af 500. Kendte artikler springes over for at undgå duplikater. Kan bypasses med <span style={mono}>force = true</span> for at genimportere eksisterende artikler.
                </div>
              </div>
            </div>

            <div style={stepRow}>
              <div style={stepNumber}>4</div>
              <div style={stepContent}>
                <div style={stepTitle}>EFetch</div>
                <div style={{ color: "#374151", marginBottom: "6px" }}>
                  Artikeldetaljer hentes fra PubMed EFetch API i batches af 20. XML parses og følgende felter udtrækkes:
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", fontSize: "13px" }}>
                  {["titel", "abstract", "forfattere", "MeSH-terms", "journal", "dato", "ISSN", "grants", "substances"].map((f) => (
                    <span key={f} style={mono}>{f}</span>
                  ))}
                </div>
              </div>
            </div>

            <div style={stepRow}>
              <div style={stepNumber}>5</div>
              <div style={stepContent}>
                <div style={stepTitle}>Upsert</div>
                <div style={{ color: "#374151", marginBottom: "6px" }}>
                  Artikler indsættes i <span style={mono}>articles</span>-tabellen med <span style={mono}>ON CONFLICT (pubmed_id) DO NOTHING</span>. Circle afgør initial status:
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "4px 12px", fontSize: "13px", color: "#374151" }}>
                  <span style={mono}>Circle 1</span><span><span style={mono}>status = approved</span>, <span style={mono}>approval_method = journal</span></span>
                  <span style={mono}>Circle 2+3</span><span><span style={mono}>status = pending</span></span>
                </div>
                <div style={{ color: "#374151", marginTop: "6px" }}>
                  Event: <span style={mono}>imported</span> med payload <span style={mono}>{"{ circle, status, approval_method, specialty_tags, pubmed_id, import_log_id }"}</span>.
                </div>
              </div>
            </div>

            <div style={stepRow}>
              <div style={stepNumber}>6</div>
              <div style={stepContent}>
                <div style={stepTitle}>Quality checks</div>
                <div style={{ color: "#374151" }}>
                  <span style={mono}>runArticleChecks()</span> validerer importerede artikler mod kendte kvalitetskriterier — manglende abstract, ugyldige datoer, suspekte forfattertællinger m.m. Fejl logges som warnings uden at blokere importen.
                </div>
              </div>
            </div>

            <div style={{ ...stepRow, marginBottom: 0 }}>
              <div style={stepNumber}>7</div>
              <div style={stepContent}>
                <div style={stepTitle}>City normalisering</div>
                <div style={{ color: "#374151" }}>
                  <span style={mono}>normalize_geo_city()</span> PostgreSQL-funktion køres én gang per import-run hvis nye artikler blev importeret. Renser resterende garbage-værdier i <span style={mono}>geo_city</span> via <span style={mono}>city_aliases</span>-tabellen.
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
              "lib/pubmed/importer.ts",
              "lib/pubmed/quality-checks.ts",
              "lib/article-events/import-payload.ts",
              "app/api/admin/import/route.ts",
            ].map((f) => (
              <span key={f} style={fileLink}>{f}</span>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
