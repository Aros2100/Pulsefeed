"use client";

import Link from "next/link";
import type { GeoRegion, GeoCountry, GeoCity, GeoArticle } from "./page";

interface Props {
  region?: string;
  country?: string;
  city?: string;
  regions: GeoRegion[];
  countries: GeoCountry[];
  cities: GeoCity[];
  articles: GeoArticle[];
}

function BarRow({
  label,
  count,
  maxCount,
  color,
  href,
}: {
  label: string;
  count: number;
  maxCount: number;
  color: string;
  href: string;
}) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <Link
      href={href}
      style={{
        display: "grid",
        gridTemplateColumns: "160px 1fr 50px",
        alignItems: "center",
        gap: "12px",
        padding: "10px 0",
        textDecoration: "none",
        color: "#1a1a1a",
      }}
    >
      <span style={{
        fontSize: "13px",
        fontWeight: 600,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {label}
      </span>
      <div style={{ height: "8px", borderRadius: "4px", background: "#f1f3f7", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          borderRadius: "4px",
          background: color,
          width: `${pct}%`,
          transition: "width 0.4s ease",
        }} />
      </div>
      <span style={{
        fontSize: "12px",
        fontWeight: 700,
        textAlign: "right",
        fontVariantNumeric: "tabular-nums",
      }}>
        {count}
      </span>
    </Link>
  );
}

export default function GeoExplorer({
  region,
  country,
  city,
  regions,
  countries,
  cities,
  articles,
}: Props) {
  // Determine current level
  const level = city ? 4 : country ? 3 : region ? 2 : 1;

  // Build breadcrumb segments
  const crumbs: { label: string; href: string }[] = [
    { label: "Alle regioner", href: "/geo" },
  ];
  if (region) {
    crumbs.push({ label: region, href: `/geo?region=${encodeURIComponent(region)}` });
  }
  if (country) {
    crumbs.push({
      label: country,
      href: `/geo?region=${encodeURIComponent(region!)}&country=${encodeURIComponent(country)}`,
    });
  }
  if (city) {
    crumbs.push({
      label: city,
      href: `/geo?region=${encodeURIComponent(region!)}&country=${encodeURIComponent(country!)}&city=${encodeURIComponent(city)}`,
    });
  }

  // Back link = second-to-last crumb
  const backHref = crumbs.length > 1 ? crumbs[crumbs.length - 2].href : null;

  return (
    <div>
      {/* Back button */}
      {backHref && (
        <Link
          href={backHref}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "13px",
            color: "#5a6a85",
            textDecoration: "none",
            marginBottom: "16px",
          }}
        >
          ← Tilbage
        </Link>
      )}

      {/* Breadcrumb */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center", marginBottom: "20px" }}>
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={c.href} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              {i > 0 && <span style={{ color: "#ccc", fontSize: "12px" }}>›</span>}
              {isLast ? (
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#1a1a1a" }}>{c.label}</span>
              ) : (
                <Link href={c.href} style={{ fontSize: "13px", color: "#5a6a85", textDecoration: "none" }}>
                  {c.label}
                </Link>
              )}
            </span>
          );
        })}
      </div>

      {/* Chart card */}
      <div style={{
        background: "#fff",
        borderRadius: "10px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
        overflow: "hidden",
      }}>
        <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
          <div style={{
            fontSize: "11px",
            letterSpacing: "0.08em",
            color: "#5a6a85",
            textTransform: "uppercase",
            fontWeight: 700,
          }}>
            {level === 1 && "Regioner"}
            {level === 2 && `Lande i ${region}`}
            {level === 3 && `Byer i ${country}`}
            {level === 4 && `Artikler fra ${city}`}
          </div>
        </div>

        <div style={{ padding: "16px 24px 20px" }}>
          {/* Level 1: Regions */}
          {level === 1 && (
            regions.length === 0 ? (
              <div style={{ padding: "12px 0", fontSize: "14px", color: "#888" }}>
                Ingen geo-data denne uge.
              </div>
            ) : (
              regions.map((r) => (
                <BarRow
                  key={r.region}
                  label={r.region}
                  count={r.count}
                  maxCount={regions[0].count}
                  color="#E83B2A"
                  href={`/geo?region=${encodeURIComponent(r.region)}`}
                />
              ))
            )
          )}

          {/* Level 2: Countries */}
          {level === 2 && (
            countries.length === 0 ? (
              <div style={{ padding: "12px 0", fontSize: "14px", color: "#888" }}>
                Ingen lande fundet for denne region.
              </div>
            ) : (
              countries.map((c) => (
                <BarRow
                  key={c.country}
                  label={c.country}
                  count={c.count}
                  maxCount={countries[0].count}
                  color="#F4A5A0"
                  href={`/geo?region=${encodeURIComponent(region!)}&country=${encodeURIComponent(c.country)}`}
                />
              ))
            )
          )}

          {/* Level 3: Cities */}
          {level === 3 && (
            cities.length === 0 ? (
              <div style={{ padding: "12px 0", fontSize: "14px", color: "#888" }}>
                Ingen byer fundet for dette land.
              </div>
            ) : (
              cities.map((c) => (
                <BarRow
                  key={c.city}
                  label={c.city}
                  count={c.count}
                  maxCount={cities[0].count}
                  color="#FADBD8"
                  href={`/geo?region=${encodeURIComponent(region!)}&country=${encodeURIComponent(country!)}&city=${encodeURIComponent(c.city)}`}
                />
              ))
            )
          )}

          {/* Level 4: Articles */}
          {level === 4 && (
            articles.length === 0 ? (
              <div style={{ padding: "12px 0", fontSize: "14px", color: "#888" }}>
                Ingen artikler fundet for denne by.
              </div>
            ) : (
              articles.map((a, i) => (
                <div
                  key={a.id}
                  style={{
                    padding: "12px 0",
                    borderTop: i === 0 ? undefined : "1px solid #f0f0f0",
                  }}
                >
                  <Link
                    href={`/articles/${a.id}`}
                    style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a", textDecoration: "none" }}
                  >
                    {a.title}
                  </Link>
                  <div style={{ fontSize: "12px", color: "#888", marginTop: "3px" }}>
                    {[a.journal_abbr, a.published_date?.slice(0, 10)].filter(Boolean).join(" · ")}
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
}
