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
    articles_without_authors: number;
    articles_with_mismatch: number;
  };
  geo_extraction: {
    with_country: number;
    with_country_pct: number;
    with_city: number;
    with_city_pct: number;
    no_country: number;
    no_city: number;
    no_geo: number;
    affiliation_too_long: number;
  };
  geo_quality: {
    suspect_city_values: number;
    suspect_country_values: number;
    country_alias_pairs: number;
    city_alias_pairs: number;
  };
  article_location?: {
    with_country: number;
    with_country_pct: number;
    with_city: number;
    with_city_pct: number;
    no_country: number;
    no_city: number;
    not_parsed: number;
    high_confidence: number;
    low_confidence: number;
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
          <div style={{ color: "#94a3b8", fontSize: "14px" }}>Loading…</div>
        </div>
      </div>
    );
  }

  const { overview, import: imp, author_linking, geo_extraction, geo_quality } = data;
  const article_location = data.article_location ?? {
    with_country: 0, with_country_pct: 0, with_city: 0, with_city_pct: 0,
    no_country: 0, no_city: 0, not_parsed: 0, high_confidence: 0, low_confidence: 0,
  };

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
          <KpiCard label="Total articles"       value={num(overview.total_articles)} />
          <KpiCard label="Total authors"        value={num(overview.total_authors)} />
          <KpiCard label="Last import"          value={fmt(overview.last_import_at)} />
          <KpiCard label="Last author records run" value={fmt(overview.last_author_linking_at)} />
        </div>

        {/* 1 · Import */}
        <SectionCard number="1" title="Importing articles from PubMed" timestamp={fmt(imp.last_run_at)}>
          <div style={{ ...metricsGrid, gridTemplateColumns: "repeat(3, 1fr)" }}>
            <MetricCard label="Articles imported" value={num(imp.articles_imported)} sub="latest run" />
            <MetricCard label="Total in DB"        value={num(imp.total_articles)} />
            <MetricCard label="Awaiting linking"   value={num(imp.awaiting_linking)}
              highlight={imp.awaiting_linking > 500 ? "amber" : imp.awaiting_linking > 0 ? undefined : "green"} />
          </div>
        </SectionCard>

        {/* 2 · Author linking */}
        <SectionCard number="2" title="Adding author records" timestamp={fmt(author_linking.last_run_at)}>
          <div style={{ ...metricsGrid, gridTemplateColumns: "repeat(6, 1fr)" }}>
            <MetricCard label="Articles processed" value={num(author_linking.articles_processed)} sub="latest run" />
            <MetricCard label="New authors"        value={num(author_linking.new_authors)} />
            <MetricCard label="Existing"           value={num(author_linking.existing)} />
            <Link href="/admin/system/import" style={{ textDecoration: "none" }}>
              <MetricCard label="Rejected"           value={num(author_linking.rejected)} />
            </Link>
            <MetricCard label="Articles without authors" value={num(author_linking.articles_without_authors)}
              highlight={author_linking.articles_without_authors > 200 ? "amber" : undefined} />
            <MetricCard label="Articles missing authors"          value={num(author_linking.articles_with_mismatch)}
              highlight={author_linking.articles_with_mismatch > 0 ? "amber" : undefined} />
          </div>
        </SectionCard>

        {/* 3 · Geo extraction */}
        <SectionCard number="3" title="Author location data coverage" timestamp="Cumulative · all authors">
          <div style={{ ...metricsGrid, gridTemplateColumns: "repeat(6, 1fr)" }}>
            <MetricCard label="With country"       value={num(geo_extraction.with_country)} sub={`${geo_extraction.with_country_pct}%`} highlight="green" />
            <MetricCard label="With city"          value={num(geo_extraction.with_city)}    sub={`${geo_extraction.with_city_pct}%`} />
            <Link href="/admin/authors?filter=no_country" style={{ textDecoration: "none" }}>
              <MetricCard label="No country"       value={num(geo_extraction.no_country)} />
            </Link>
            <Link href="/admin/authors?filter=no_city" style={{ textDecoration: "none" }}>
              <MetricCard label="No city"          value={num(geo_extraction.no_city)} />
            </Link>
            <Link href="/admin/authors?filter=no_geo" style={{ textDecoration: "none" }}>
              <MetricCard label="No geo"           value={num(geo_extraction.no_geo)} />
            </Link>
            <Link href="/admin/authors?filter=affiliation_too_long" style={{ textDecoration: "none" }}>
              <MetricCard label="Affiliation too long" value={num(geo_extraction.affiliation_too_long)} />
            </Link>
          </div>
        </SectionCard>

        {/* 4 · Author location data quality */}
        <SectionCard number="4" title="Author location data quality" timestamp="Cumulative · all authors">
          <div style={{ ...metricsGrid, gridTemplateColumns: "repeat(4, 1fr)" }}>
            <Link href="/admin/authors?filter=suspect_city" style={{ textDecoration: "none" }}>
              <MetricCard label="Suspect city values"    value={num(geo_quality.suspect_city_values)}
                highlight={geo_quality.suspect_city_values > 0 ? "amber" : "green"} />
            </Link>
            <Link href="/admin/authors?filter=suspect_country" style={{ textDecoration: "none" }}>
              <MetricCard label="Suspect country values" value={num(geo_quality.suspect_country_values)}
                highlight={geo_quality.suspect_country_values > 0 ? "amber" : undefined} />
            </Link>
            <Link href="/admin/authors?filter=country_alias" style={{ textDecoration: "none" }}>
              <MetricCard label="Country alias pairs"    value={num(geo_quality.country_alias_pairs)}
                highlight={geo_quality.country_alias_pairs > 0 ? "amber" : undefined} />
            </Link>
            <Link href="/admin/authors?filter=city_alias" style={{ textDecoration: "none" }}>
              <MetricCard label="City alias pairs"       value={num(geo_quality.city_alias_pairs)}
                highlight={geo_quality.city_alias_pairs > 0 ? "amber" : undefined} />
            </Link>
          </div>
        </SectionCard>

        {/* 5 · Article location data coverage */}
        <SectionCard number="5" title="Article location data coverage" timestamp="Cumulative · all articles">
          <div style={{ ...metricsGrid, gridTemplateColumns: "repeat(4, 1fr)" }}>
            <MetricCard label="With country"     value={num(article_location.with_country)} sub={`${article_location.with_country_pct}%`} highlight="green" />
            <MetricCard label="With city"        value={num(article_location.with_city)}    sub={`${article_location.with_city_pct}%`} />
            <Link href="/admin/articles?filter=no_country" style={{ textDecoration: "none" }}>
              <MetricCard label="No country"     value={num(article_location.no_country)}
                highlight={article_location.no_country > 0 ? "amber" : "green"} />
            </Link>
            <MetricCard label="No city"          value={num(article_location.no_city)} />
          </div>
          <div style={{ ...metricsGrid, gridTemplateColumns: "repeat(3, 1fr)", paddingTop: 0 }}>
            <Link href="/admin/articles?filter=not_parsed" style={{ textDecoration: "none" }}>
              <MetricCard label="Not parsed"     value={num(article_location.not_parsed)}
                highlight={article_location.not_parsed > 0 ? "amber" : "green"} />
            </Link>
            <MetricCard label="High confidence" value={num(article_location.high_confidence)} highlight="green" />
            <MetricCard label="Low confidence"  value={num(article_location.low_confidence)}
              highlight={article_location.low_confidence > 0 ? "amber" : undefined} />
          </div>
        </SectionCard>

      </div>
    </div>
  );
}
