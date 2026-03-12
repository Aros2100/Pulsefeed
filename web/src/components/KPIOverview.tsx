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

// TODO: Fetch from user_subspecialties table when it exists
const USER_SUBSPECIALTIES = [
  "Spine surgery",
  "Neurosurgical oncology and Radiosurgery",
  "Vascular and Endovascular Neurosurgery",
];

// Geo labels: API values are already English, just pass through
function geoLabel(value: string): string {
  return value;
}

type Period = "week" | "month" | "year";
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

const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

export default function KPIOverview() {
  const [period, setPeriod] = useState<Period>("week");
  const [scope, setScope] = useState<string>("all");
  const [geoLevel, setGeoLevel] = useState<GeoLevel>("all");
  const [data, setData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fading, setFading] = useState(false);

  const fetchData = useCallback(async (p: Period, s: string) => {
    const params = new URLSearchParams({ period: p });
    if (s !== "all") params.set("subspecialty", s);
    const res = await fetch(`/api/kpi?${params}`);
    if (res.ok) {
      return (await res.json()) as KPIData;
    }
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
      const result = await fetchData(period, scope);
      if (!cancelled) {
        setData(result);
        setLoading(false);
        setFading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [period, scope, fetchData]); // eslint-disable-line react-hooks/exhaustive-deps

  const scopes = [
    { key: "all", label: "Neurosurgery" },
    ...USER_SUBSPECIALTIES.map((s) => ({ key: s, label: s })),
  ];

  // Build geo button list from userGeo
  const geoButtons: { level: GeoLevel; label: string; value: number }[] = [];
  if (data) {
    geoButtons.push({ level: "all", label: "All", value: data.geoHierarchy.all });
    if (data.userGeo) {
      const geo = data.userGeo;
      if (geo.continent) geoButtons.push({ level: "continent", label: geoLabel(geo.continent), value: data.geoHierarchy.continent });
      if (geo.region) geoButtons.push({ level: "region", label: geoLabel(geo.region), value: data.geoHierarchy.region });
      geoButtons.push({ level: "country", label: geoLabel(geo.country), value: data.geoHierarchy.country });
      if (geo.city) geoButtons.push({ level: "city", label: geoLabel(geo.city), value: data.geoHierarchy.city });
    }
  }

  // Central number = count at selected geo level
  const centralNumber = data ? data.geoHierarchy[geoLevel] : 0;

  const contentOpacity = fading ? 0.2 : 1;

  return (
    <div className={dmSans.className} style={{ marginBottom: "12px" }}>
      {/* Header line */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "16px",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontSize: "15px", fontWeight: 700, color: "#1e293b" }}>
            New articles
          </span>
          <span className={dmMono.className} style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 400 }}>
            {data?.periodLabel ?? "…"}
          </span>
        </div>

        {/* Period toggle */}
        <div style={{
          display: "flex",
          gap: "2px",
          background: "#f1f5f9",
          borderRadius: "10px",
          padding: "3px",
        }}>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              style={{
                padding: "5px 14px",
                fontSize: "12px",
                fontWeight: period === p.key ? 600 : 400,
                color: period === p.key ? "#1e293b" : "#64748b",
                background: period === p.key ? "#fff" : "transparent",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                boxShadow: period === p.key ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s ease",
                fontFamily: "inherit",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
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
          minHeight: "120px",
        }}>
          {/* Left: Geo hierarchy buttons */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            padding: "16px 20px",
            justifyContent: "center",
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
                      ? {
                          background: "linear-gradient(135deg, #c0392b, #a93226)",
                          color: "#fff",
                          boxShadow: "0 2px 8px rgba(192, 57, 43, 0.35)",
                        }
                      : {
                          background: "#f8fafc",
                          color: "#64748b",
                        }),
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "#f1f5f9";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "#f8fafc";
                    }
                  }}
                >
                  <span>{item.label}</span>
                  <span className={dmMono.className} style={{
                    fontWeight: 600,
                    fontSize: "11px",
                  }}>
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
              }}>
                …
              </div>
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
          <div style={{
            width: "1px",
            background: "#e2e8f0",
            margin: "16px 0",
          }} />

          {/* Center: big number */}
          <div style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "28px 32px",
          }}>
            <div className={fraunces.className} style={{
              fontSize: "52px",
              fontWeight: 800,
              color: "#1e293b",
              lineHeight: 1,
              letterSpacing: "-0.02em",
            }}>
              {loading && !data ? "—" : <AnimatedNumber value={centralNumber} />}
            </div>
            <div style={{
              fontSize: "13px",
              color: "#94a3b8",
              marginTop: "6px",
              fontWeight: 500,
            }}>
              articles
            </div>
          </div>

          {/* Vertical divider */}
          <div style={{
            width: "1px",
            background: "#e2e8f0",
            margin: "16px 0",
          }} />

          {/* Right: scope buttons */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            padding: "16px 20px",
            justifyContent: "center",
            minWidth: "220px",
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
                      ? {
                          background: "linear-gradient(135deg, #c0392b, #a93226)",
                          color: "#fff",
                          boxShadow: "0 2px 8px rgba(192, 57, 43, 0.35)",
                        }
                      : {
                          background: "#f8fafc",
                          color: "#64748b",
                        }),
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "#f1f5f9";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "#f8fafc";
                    }
                  }}
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
