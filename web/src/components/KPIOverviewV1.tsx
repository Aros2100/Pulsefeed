"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { DM_Sans, DM_Mono, Fraunces } from "next/font/google";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  display: "swap",
});

type GeoLevel = "all" | "continent" | "region" | "country" | "city";

interface GeoHierarchy {
  all: number;
  continent: number;
  region: number;
  country: number;
  city: number;
}

interface UserGeo {
  continent: string | null;
  region: string | null;
  country: string;
  city: string | null;
  hospital: string | null;
}

interface KPIData {
  totalArticles: number;
  periodLabel: string;
  geoHierarchy: GeoHierarchy;
  userGeo: UserGeo | null;
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) return;

    const duration = 600;
    const start = performance.now();

    function easeOut(t: number) {
      return 1 - Math.pow(1 - t, 3);
    }

    let raf: number;
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOut(progress);
      const current = Math.round(from + (to - from) * eased);
      setDisplay(current);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
      }
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{display.toLocaleString("en-US")}</>;
}

function buildPubMedHref(
  scope: string,
  geoLevel: GeoLevel,
  userGeo: UserGeo | null,
): string {
  const parts: string[] = [];

  if (scope === "general") {
    parts.push("neurosurgery[MeSH Terms]");
  } else {
    parts.push(`"${scope}"[Title/Abstract]`, "neurosurgery[MeSH Terms]");
  }

  if (geoLevel !== "all" && userGeo) {
    const geoValue =
      geoLevel === "city"      ? userGeo.city :
      geoLevel === "region"    ? userGeo.region :
      geoLevel === "country"   ? userGeo.country :
      geoLevel === "continent" ? userGeo.continent :
      null;
    if (geoValue) parts.push(`"${geoValue}"[Affiliation]`);
  }

  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  const fmt = (d: Date) =>
    `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  parts.push(`("${fmt(weekAgo)}"[Date - Publication] : "${fmt(today)}"[Date - Publication])`);

  return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(parts.join(" AND "))}`;
}

interface KPIOverviewV1Props {
  userSubspecialties: string[] | null;
  // full name → short display name, from subspecialties.short_name
  shortNameMap: Record<string, string>;
}

export default function KPIOverviewV1({ userSubspecialties, shortNameMap }: KPIOverviewV1Props) {
  // "general" = General Neurosurgery (all), otherwise subspecialty name
  const [scope, setScope] = useState<string>("general");
  const [geoLevel, setGeoLevel] = useState<GeoLevel>("all");
  const [data, setData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fading, setFading] = useState(false);

  const fetchData = useCallback(async (s: string) => {
    const params = new URLSearchParams({ period: "week" });
    if (s !== "general") params.set("subspecialty", s);
    const res = await fetch(`/api/kpi?${params}`);
    if (res.ok) return (await res.json()) as KPIData;
    return null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (data) {
        setFading(true);
        await new Promise((r) => setTimeout(r, 100));
      }
      setLoading(true);
      const result = await fetchData(scope);
      if (!cancelled) {
        setData(result);
        setLoading(false);
        setFading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [scope, fetchData]); // eslint-disable-line react-hooks/exhaustive-deps

  // General Neurosurgery always first, then up to 3 user subspecialties.
  // Filter out "Neurosurgery" — it's the specialty itself, covered by General Neurosurgery.
  const filteredSubs = (userSubspecialties ?? [])
    .filter((s) => s.toLowerCase() !== "neurosurgery")
    .slice(0, 3);

  const scopes = [
    { key: "general", label: "General Neurosurgery" },
    ...filteredSubs.map((s) => ({ key: s, label: shortNameMap[s] ?? s })),
  ];

  // Geo buttons from userGeo
  const geoButtons: { level: GeoLevel; label: string; value: number }[] = [];
  if (data) {
    geoButtons.push({ level: "all", label: "All", value: data.geoHierarchy?.all ?? 0 });
    if (data.userGeo) {
      const geo = data.userGeo;
      if (geo.continent) geoButtons.push({ level: "continent", label: geo.continent, value: data.geoHierarchy?.continent ?? 0 });
      if (geo.region)    geoButtons.push({ level: "region",    label: geo.region,    value: data.geoHierarchy?.region    ?? 0 });
      geoButtons.push({   level: "country",   label: geo.country,   value: data.geoHierarchy?.country   ?? 0 });
      if (geo.city)      geoButtons.push({ level: "city",      label: geo.city,      value: data.geoHierarchy?.city      ?? 0 });
    }
  }

  const centralNumber = data ? (data.geoHierarchy?.[geoLevel] ?? 0) : 0;
  const contentOpacity = fading ? 0.2 : 1;

  return (
    <div className={dmSans.className} style={{ marginBottom: "12px" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "16px",
      }}>
        <span style={{ fontSize: "15px", fontWeight: 700, color: "#1e293b" }}>
          This week on PubMed
        </span>
      </div>

      {/* Hero card */}
      <div style={{
        background: "#fff",
        borderRadius: "12px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
        overflow: "hidden",
        transition: "opacity 0.1s ease",
        opacity: contentOpacity,
      }}>
        <div style={{
          display: "flex",
          alignItems: "stretch",
          minHeight: "160px",
        }}>
          {/* Left: Geo hierarchy buttons */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            padding: "20px 20px 16px",
            justifyContent: "flex-start",
            minWidth: "220px",
          }}>
            {geoButtons.length > 0 ? geoButtons.map((item) => {
              const isActive = geoLevel === item.level;
              return (
                <button
                  key={item.level}
                  onClick={() => setGeoLevel(item.level)}
                  style={{
                    padding: "8px 16px",
                    fontSize: "12px",
                    fontWeight: isActive ? 600 : 500,
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "8px",
                    ...(isActive
                      ? { background: "linear-gradient(135deg, #c0392b, #a93226)", color: "#fff", boxShadow: "0 2px 8px rgba(192, 57, 43, 0.35)" }
                      : { background: "#f8fafc", color: "#64748b" }),
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#f1f5f9"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "#f8fafc"; }}
                >
                  <span>{item.label}</span>
                  <span className={dmMono.className} style={{ fontWeight: 600, fontSize: "11px", minWidth: "2.5rem", textAlign: "right" }}>
                    <AnimatedNumber value={item.value} />
                  </span>
                </button>
              );
            }) : (
              <div style={{
                padding: "8px 16px",
                fontSize: "12px",
                fontWeight: 500,
                borderRadius: "8px",
                background: "#f8fafc",
                color: "#94a3b8",
                textAlign: "center",
              }}>…</div>
            )}
            {data && !data.userGeo && (
              <Link
                href="/profile"
                style={{ fontSize: "11px", color: "#94a3b8", textDecoration: "none", marginTop: "2px", textAlign: "center" }}
              >
                Add location →
              </Link>
            )}
          </div>

          {/* Vertical divider */}
          <div style={{ width: "1px", background: "#e2e8f0", margin: "16px 0" }} />

          {/* Center: big number → PubMed link */}
          <a
            href={buildPubMedHref(scope, geoLevel, data?.userGeo ?? null)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "28px 32px",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div className={fraunces.className} style={{
              fontSize: "52px",
              fontWeight: 800,
              color: "#1e293b",
              lineHeight: 1,
              letterSpacing: "-0.02em",
              cursor: "pointer",
            }}>
              {loading && !data ? "—" : <AnimatedNumber value={centralNumber} />}
            </div>
            <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "6px", fontWeight: 500 }}>
              articles →
            </div>
          </a>

          {/* Vertical divider */}
          <div style={{ width: "1px", background: "#e2e8f0", margin: "16px 0" }} />

          {/* Right: subspecialty scope buttons */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            padding: "20px 20px 16px",
            justifyContent: "flex-start",
            minWidth: 0,
            overflow: "hidden",
          }}>
            {scopes.map((s) => {
              const isActive = scope === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setScope(s.key)}
                  style={{
                    padding: "8px 16px",
                    fontSize: "12px",
                    fontWeight: isActive ? 600 : 500,
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    ...(isActive
                      ? { background: "linear-gradient(135deg, #c0392b, #a93226)", color: "#fff", boxShadow: "0 2px 8px rgba(192, 57, 43, 0.35)" }
                      : { background: "#f8fafc", color: "#64748b" }),
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#f1f5f9"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "#f8fafc"; }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
