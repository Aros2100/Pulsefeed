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
  author_location?: {
    with_region: number;
    with_region_pct: number;
    with_country: number;
    with_country_pct: number;
    with_state: number;
    with_state_pct: number;
    with_city: number;
    distinct_regions: number;
    no_region: number;
    no_country: number;
    no_state: number;
    no_city: number;
    no_geo: number;
    affiliation_too_long: number;
    suspect_city_values: number;
    source_ror: number;
    source_parser: number;
    verified_human: number;
  };
  article_location?: {
    with_region: number;
    with_region_pct: number;
    no_region: number;
    with_country: number;
    with_country_pct: number;
    no_country: number;
    with_state: number;
    with_state_pct: number;
    no_state: number;
    with_city: number;
    no_city: number;
    not_parsed: number;
    suspect_city_values: number;
    distinct_regions: number;
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

function MetricCard({ label, value, sub, sub2, highlight, subHighlight, sub2Highlight }: {
  label: string; value: string;
  sub?: string; sub2?: string;
  highlight?: "green" | "amber" | "red";
  subHighlight?: "green" | "amber" | "red";
  sub2Highlight?: "green" | "amber" | "red";
}) {
  const colors: Record<string, string> = { green: "#15803d", amber: "#d97706", red: "#dc2626" };
  const valueColor = highlight ? colors[highlight] : "#1a1a1a";
  const subColor = subHighlight ? colors[subHighlight] : "#94a3b8";
  const sub2Color = sub2Highlight ? colors[sub2Highlight] : "#94a3b8";
  return (
    <div style={{ background: "#f8f9fb", borderRadius: "8px", padding: "16px 18px", height: "100%", boxSizing: "border-box" }}>
      <div style={{ fontSize: "11px", color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "4px" }}>
        {label}
      </div>
      <div style={{ fontSize: "20px", fontWeight: 700, color: valueColor }}>{value}</div>
      {sub  && <div style={{ fontSize: "11px", color: subColor,  marginTop: "2px" }}>{sub}</div>}
      {sub2 && <div style={{ fontSize: "11px", color: sub2Color, marginTop: "1px" }}>{sub2}</div>}
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

  const { overview, import: imp, author_linking } = data;
  const author_location = data.author_location ?? {
    with_region: 0, with_region_pct: 0,
    with_country: 0, with_country_pct: 0,
    with_state: 0, with_state_pct: 0,
    with_city: 0, distinct_regions: 0,
    no_region: 0, no_country: 0, no_state: 0, no_city: 0, no_geo: 0,
    affiliation_too_long: 0, suspect_city_values: 0,
    source_ror: 0, source_parser: 0, verified_human: 0,
  };
  const article_location = data.article_location ?? {
    with_region: 0, with_region_pct: 0, no_region: 0,
    with_country: 0, with_country_pct: 0, no_country: 0,
    with_state: 0, with_state_pct: 0, no_state: 0,
    with_city: 0, no_city: 0,
    not_parsed: 0, suspect_city_values: 0, distinct_regions: 0,
  };

  const totalA   = overview.total_authors;
  const totalArt = overview.total_articles;

  const cleanAuthorCities    = author_location.with_city - author_location.suspect_city_values;
  const cleanAuthorCitiesPct = totalA > 0 ? Math.round((cleanAuthorCities / totalA) * 1000) / 10 : 0;
  const authorSuspectCount   = author_location.suspect_city_values;

  const cleanCities    = article_location.with_city - article_location.suspect_city_values;
  const cleanCitiesPct = totalArt > 0 ? Math.round((cleanCities / totalArt) * 1000) / 10 : 0;
  const suspectCount   = article_location.suspect_city_values;

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
          <div style={{ padding: "0 20px 16px", textAlign: "right" }}>
            <Link href="/admin/system/data-quality/docs/pubmed-import" style={{ fontSize: "12px", color: "#5a6a85", textDecoration: "none" }}>
              → PubMed import pipeline documentation
            </Link>
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
          <div style={{ padding: "0 20px 16px", textAlign: "right" }}>
            <Link href="/admin/system/data-quality/docs/author-linking" style={{ fontSize: "12px", color: "#5a6a85", textDecoration: "none" }}>
              → Author linking pipeline documentation
            </Link>
          </div>
        </SectionCard>

        {/* 3 · Author location data */}
        <SectionCard number="3" title="Author location data" timestamp="Cumulative · all authors">
          {/* Row 1 — Coverage */}
          <div style={{ ...metricsGrid, gridTemplateColumns: "repeat(4, 1fr)", alignItems: "stretch" }}>
            <MetricCard
              label="Region coverage"
              value={num(author_location.with_region)}
              highlight="green"
              sub={`${author_location.with_region_pct}%`}
              sub2={`${num(author_location.distinct_regions)} / 15 regioner`}
              sub2Highlight={author_location.distinct_regions >= 15 ? "green" : author_location.distinct_regions >= 10 ? "amber" : "red"}
            />
            <MetricCard
              label="Country coverage"
              value={num(author_location.with_country)}
              highlight="green"
              sub={`${author_location.with_country_pct}%`}
              sub2="0 urene"
              sub2Highlight="green"
            />
            <MetricCard
              label="State coverage"
              value={num(author_location.with_state)}
              highlight="green"
              sub={`${author_location.with_state_pct}%`}
              sub2="0 urene"
              sub2Highlight="green"
            />
            <Link href="/admin/authors?suspect_city=true" style={{ textDecoration: "none" }}>
              <MetricCard
                label="City coverage"
                value={num(cleanAuthorCities)}
                highlight="green"
                sub={`${cleanAuthorCitiesPct}%`}
                sub2={`${num(authorSuspectCount)} urene`}
                sub2Highlight={authorSuspectCount > 50 ? "red" : authorSuspectCount > 0 ? "amber" : "green"}
              />
            </Link>
          </div>
          {/* Row 2 — Missing */}
          <div style={{ ...metricsGrid, gridTemplateColumns: "repeat(4, 1fr)", alignItems: "stretch", paddingTop: 0 }}>
            <Link href="/admin/authors?filter=no_region" style={{ textDecoration: "none" }}>
              <MetricCard
                label="No region"
                value={num(author_location.no_region)}
                highlight={author_location.no_region > 0 ? "amber" : "green"}
              />
            </Link>
            <Link href="/admin/authors?filter=no_country" style={{ textDecoration: "none" }}>
              <MetricCard
                label="No country"
                value={num(author_location.no_country)}
                highlight={author_location.no_country > 0 ? "amber" : "green"}
              />
            </Link>
            <Link href="/admin/authors?filter=no_state" style={{ textDecoration: "none" }}>
              <MetricCard
                label="No state"
                value={num(author_location.no_state)}
                highlight={author_location.no_state > 0 ? "amber" : "green"}
              />
            </Link>
            <Link href="/admin/authors?filter=no_city" style={{ textDecoration: "none" }}>
              <MetricCard
                label="No city"
                value={num(author_location.no_city)}
                highlight={author_location.no_city > 0 ? "amber" : "green"}
              />
            </Link>
          </div>
          {/* Row 3 — Meta */}
          <div style={{ ...metricsGrid, gridTemplateColumns: "repeat(4, 1fr)", paddingTop: 0 }}>
            <MetricCard label="Source: ROR"       value={num(author_location.source_ror)}     sub="primær kilde" />
            <MetricCard label="Source: Parser"   value={num(author_location.source_parser)}   sub="fallback" />
            <Link href="/admin/authors?filter=suspect_city" style={{ textDecoration: "none" }}>
              <MetricCard
                label="Suspect city values"
                value={num(author_location.suspect_city_values)}
                highlight={authorSuspectCount > 50 ? "red" : authorSuspectCount > 0 ? "amber" : "green"}
              />
            </Link>
            <MetricCard
              label="Verified by human"
              value={num(author_location.verified_human)}
              highlight={author_location.verified_human > 0 ? "green" : undefined}
            />
          </div>
          <div style={{ padding: "0 20px 16px", textAlign: "right" }}>
            <Link href="/admin/system/data-quality/docs/author-geo" style={{ fontSize: "12px", color: "#5a6a85", textDecoration: "none" }}>
              → Author geo pipeline documentation
            </Link>
          </div>
        </SectionCard>

        {/* 4 · Article location data coverage */}
        <SectionCard number="4" title="Article location data coverage" timestamp="Cumulative · all articles">
          {/* Row 1 — Coverage */}
          <div style={{ ...metricsGrid, gridTemplateColumns: "repeat(4, 1fr)", alignItems: "stretch" }}>
            <MetricCard
              label="Region coverage"
              value={num(article_location.with_region)}
              highlight="green"
              sub={`${article_location.with_region_pct}%`}
              sub2={`${num(article_location.distinct_regions)} / 15 regioner`}
              sub2Highlight={article_location.distinct_regions >= 15 ? "green" : article_location.distinct_regions >= 10 ? "amber" : "red"}
            />
            <MetricCard
              label="Country coverage"
              value={num(article_location.with_country)}
              highlight="green"
              sub={`${article_location.with_country_pct}%`}
              sub2="0 urene"
              sub2Highlight="green"
            />
            <MetricCard
              label="State coverage"
              value={num(article_location.with_state)}
              highlight="green"
              sub={`${article_location.with_state_pct}%`}
              sub2="0 urene"
              sub2Highlight="green"
            />
            <Link href="/admin/articles?suspect_city=true" style={{ textDecoration: "none" }}>
              <MetricCard
                label="City coverage"
                value={num(cleanCities)}
                highlight="green"
                sub={`${cleanCitiesPct}%`}
                sub2={`${num(suspectCount)} urene`}
                sub2Highlight={suspectCount > 50 ? "red" : suspectCount > 0 ? "amber" : "green"}
              />
            </Link>
          </div>
          {/* Row 2 — Missing */}
          <div style={{ ...metricsGrid, gridTemplateColumns: "repeat(4, 1fr)", alignItems: "stretch", paddingTop: 0 }}>
            <Link href="/admin/articles?no_region=true" style={{ textDecoration: "none" }}>
              <MetricCard
                label="No region"
                value={num(article_location.no_region)}
                highlight={article_location.no_region > 0 ? "amber" : "green"}
              />
            </Link>
            <Link href="/admin/articles?no_country=true" style={{ textDecoration: "none" }}>
              <MetricCard
                label="No country"
                value={num(article_location.no_country)}
                highlight={article_location.no_country > 0 ? "amber" : "green"}
              />
            </Link>
            <Link href="/admin/articles?no_state=true" style={{ textDecoration: "none" }}>
              <MetricCard
                label="No state"
                value={num(article_location.no_state)}
                highlight={article_location.no_state > 0 ? "amber" : "green"}
              />
            </Link>
            <Link href="/admin/articles?no_city=true" style={{ textDecoration: "none" }}>
              <MetricCard
                label="No city"
                value={num(article_location.no_city)}
                highlight={article_location.no_city > 0 ? "amber" : "green"}
              />
            </Link>
          </div>
          {/* Row 3 — Meta */}
          <div style={{ ...metricsGrid, gridTemplateColumns: "repeat(4, 1fr)", paddingTop: 0 }}>
            <Link href="/admin/articles?not_parsed=true" style={{ textDecoration: "none" }}>
              <MetricCard
                label="Not parsed"
                value={num(article_location.not_parsed)}
                highlight={article_location.not_parsed > 0 ? "amber" : "green"}
              />
            </Link>
          </div>
          <div style={{ padding: "0 20px 16px", textAlign: "right" }}>
            <Link href="/admin/system/data-quality/docs/article-geo" style={{ fontSize: "12px", color: "#5a6a85", textDecoration: "none" }}>
              → Geo pipeline documentation
            </Link>
          </div>
        </SectionCard>


      </div>
    </div>
  );
}
