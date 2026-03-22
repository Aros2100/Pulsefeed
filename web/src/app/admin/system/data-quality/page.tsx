"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type DQData = {
  overview: {
    total_articles: number;
    total_authors: number;
    last_import_at: string | null;
    last_author_linking_at: string | null;
  };
  import: {
    last_run_at: string | null;
    articles_imported: number;
    total_articles: number;
    awaiting_linking: number;
  };
  author_linking: {
    last_run_at: string | null;
    articles_processed: number;
    new_authors: number;
    existing: number;
    rejected: number;
    still_unlinked: number;
  };
  geo_extraction: {
    with_country: number;
    with_country_pct: number;
    with_city: number;
    with_city_pct: number;
    no_geo: number;
    no_geo_pct: number;
    affiliation_no_geo_parser: number;
    affiliation_no_geo_openalex: number;
  };
  openalex: {
    with_ror_id: number;
    with_ror_id_pct: number;
    geo_source_openalex: number;
    geo_source_openalex_pct: number;
  };
  geo_quality: {
    unique_cities: number;
    suspect_city_values: number;
    country_no_city: number;
    normalization: {
      last_run_at: string | null;
      authors_normalized: number;
      duplicates_collapsed: number;
      remaining_variants: number;
    };
  };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("da-DK", {
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

function num(v: number | undefined | null) { return (v ?? 0).toLocaleString("da-DK"); }

// ── Styles ────────────────────────────────────────────────────────────────────

const SHADOW = "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)";

const card: React.CSSProperties = {
  background: "#fff", borderRadius: "10px",
  boxShadow: SHADOW, overflow: "hidden", marginBottom: "20px",
};

const sectionHeader: React.CSSProperties = {
  background: "#EEF2F7", borderBottom: "1px solid #dde3ed",
  padding: "10px 20px", display: "flex", alignItems: "center",
  justifyContent: "space-between",
};

const sectionLabel: React.CSSProperties = {
  fontSize: "11px", letterSpacing: "0.08em",
  textTransform: "uppercase", fontWeight: 700, color: "#5a6a85",
};

const metricsGrid: React.CSSProperties = {
  display: "grid", padding: "20px",
  gap: "12px",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: "10px", boxShadow: SHADOW, padding: "20px 22px" }}>
      <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "6px" }}>
        {label}
      </div>
      <div style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a1a" }}>{value}</div>
      {sub && <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px" }}>{sub}</div>}
    </div>
  );
}

function MetricCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: "green" | "amber" | "red" }) {
  const colors: Record<string, string> = { green: "#15803d", amber: "#d97706", red: "#dc2626" };
  const valueColor = highlight ? colors[highlight] : "#1a1a1a";
  return (
    <div style={{ background: "#f8f9fb", borderRadius: "8px", padding: "16px 18px" }}>
      <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "4px" }}>
        {label}
      </div>
      <div style={{ fontSize: "20px", fontWeight: 700, color: valueColor }}>{value}</div>
      {sub && <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>{sub}</div>}
    </div>
  );
}

function SectionCard({
  number, title, timestamp, children,
}: {
  number?: string; title: string; timestamp?: string; children: React.ReactNode;
}) {
  return (
    <div style={card}>
      <div style={sectionHeader}>
        <span style={sectionLabel}>
          {number && <span style={{ color: "#E83B2A", marginRight: "6px" }}>{number} ·</span>}
          {title}
        </span>
        {timestamp && (
          <span style={{ fontSize: "12px", color: "#94a3b8" }}>{timestamp}</span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DataQualityPage() {
  const [data, setData] = useState<DQData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/system/data-quality")
      .then((r) => r.json())
      .then((d: DQData) => { setData(d); setLoading(false); })
      .catch((e) => { console.error("[data-quality] fetch error:", e); setLoading(false); });
  }, []);

  if (loading || !data) {
    return (
      <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", minHeight: "100vh" }}>
        <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ color: "#94a3b8", fontSize: "14px" }}>Indlæser…</div>
        </div>
      </div>
    );
  }

  const { overview, import: imp, author_linking, geo_extraction, openalex, geo_quality } = data;

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/system" style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>← System</Link>
        </div>

        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            System · Data quality
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>Data quality</h1>
        </div>

        {/* Top KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
          <KpiCard label="Total artikler"       value={num(overview.total_articles)} />
          <KpiCard label="Total forfattere"     value={num(overview.total_authors)} />
          <KpiCard label="Seneste import"       value={fmt(overview.last_import_at)} />
          <KpiCard label="Seneste forfatter-link" value={fmt(overview.last_author_linking_at)} />
        </div>

        {/* 1 · Import */}
        <SectionCard number="1" title="Import" timestamp={fmt(imp.last_run_at)}>
          <div style={{ ...metricsGrid, gridTemplateColumns: "repeat(3, 1fr)" }}>
            <MetricCard label="Artikler importeret" value={num(imp.articles_imported)} sub="seneste kørsel" />
            <MetricCard label="Total i DB"           value={num(imp.total_articles)} />
            <MetricCard label="Afventer linking"     value={num(imp.awaiting_linking)}
              highlight={imp.awaiting_linking > 500 ? "amber" : imp.awaiting_linking > 0 ? undefined : "green"} />
          </div>
        </SectionCard>

        {/* 2 · Author linking */}
        <SectionCard number="2" title="Forfatter-linking" timestamp={fmt(author_linking.last_run_at)}>
          <div style={{ ...metricsGrid, gridTemplateColumns: "repeat(5, 1fr)" }}>
            <MetricCard label="Artikler behandlet" value={num(author_linking.articles_processed)} sub="seneste kørsel" />
            <MetricCard label="Nye forfattere"     value={num(author_linking.new_authors)} />
            <MetricCard label="Eksisterende"       value={num(author_linking.existing)} />
            <MetricCard label="Afvist"             value={num(author_linking.rejected)} />
            <MetricCard label="Stadig ulinket"     value={num(author_linking.still_unlinked)}
              highlight={author_linking.still_unlinked > 200 ? "amber" : undefined} />
          </div>
        </SectionCard>

        {/* 3 · Geo extraction */}
        <SectionCard number="3" title="Geo-udtræk" timestamp="Kumulativt · alle forfattere">
          <div style={{ ...metricsGrid, gridTemplateColumns: "repeat(5, 1fr)" }}>
            <MetricCard label="Med land"       value={num(geo_extraction.with_country)}  sub={`${geo_extraction.with_country_pct}%`} highlight="green" />
            <MetricCard label="Med by"         value={num(geo_extraction.with_city)}     sub={`${geo_extraction.with_city_pct}%`} />
            <MetricCard label="Ingen geo"      value={num(geo_extraction.no_geo)}        sub={`${geo_extraction.no_geo_pct}%`}
              highlight={geo_extraction.no_geo_pct > 30 ? "amber" : undefined} />
            <MetricCard label="Affiliering, ingen geo (parser)"   value={num(geo_extraction.affiliation_no_geo_parser)} />
            <MetricCard label="Affiliering, ingen geo (OpenAlex)" value={num(geo_extraction.affiliation_no_geo_openalex)} />
          </div>
        </SectionCard>

        {/* 4 · OpenAlex */}
        <SectionCard number="4" title="OpenAlex-berigelse" timestamp="Kumulativt · alle forfattere">
          <div style={{ ...metricsGrid, gridTemplateColumns: "repeat(2, 1fr)" }}>
            <MetricCard label="Med ROR ID"       value={num(openalex.with_ror_id)}         sub={`${openalex.with_ror_id_pct}%`} />
            <MetricCard label="Geo-kilde: OpenAlex" value={num(openalex.geo_source_openalex)} sub={`${openalex.geo_source_openalex_pct}%`} />
          </div>
        </SectionCard>

        {/* 5 · Geo data quality */}
        <SectionCard number="5" title="Geo-datakvalitet" timestamp="Kumulativt · alle forfattere">
          <div style={{ ...metricsGrid, gridTemplateColumns: "repeat(3, 1fr)" }}>
            <MetricCard label="Unikke byer"       value={num(geo_quality.unique_cities)} />
            <MetricCard label="Suspekte bynavne"  value={num(geo_quality.suspect_city_values)}
              highlight={geo_quality.suspect_city_values > 0 ? "amber" : "green"} />
            <MetricCard label="Land, ingen by"    value={num(geo_quality.country_no_city)} />
          </div>

          {/* Normalization subsection */}
          <div style={{ borderTop: "1px solid #f1f3f7", margin: "0 20px" }} />
          <div style={{ padding: "12px 20px 4px" }}>
            <div style={{ ...sectionLabel, color: "#5a6a85", marginBottom: "12px" }}>
              By-normalisering
              {geo_quality.normalization.last_run_at && (
                <span style={{ fontWeight: 400, marginLeft: "8px", color: "#94a3b8" }}>
                  {fmt(geo_quality.normalization.last_run_at)}
                </span>
              )}
            </div>
          </div>
          <div style={{ ...metricsGrid, gridTemplateColumns: "repeat(3, 1fr)", paddingTop: "0" }}>
            <MetricCard label="Forfattere normaliseret" value={num(geo_quality.normalization.authors_normalized)} />
            <MetricCard label="Dubletter kollapset"     value={num(geo_quality.normalization.duplicates_collapsed)} />
            <MetricCard label="Resterende varianter"    value={num(geo_quality.normalization.remaining_variants)}
              highlight={geo_quality.normalization.remaining_variants === 0 ? "green" : "amber"} />
          </div>
        </SectionCard>

      </div>
    </div>
  );
}
