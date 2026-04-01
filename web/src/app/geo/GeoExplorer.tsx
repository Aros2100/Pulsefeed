"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type {
  GeoContinent,
  GeoRegion,
  GeoCountry,
  GeoState,
  GeoCity,
  GeoArticle,
} from "./page";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  continent?: string;
  region?: string;
  country?: string;
  state?: string;
  city?: string;
  continents: GeoContinent[];
  regions: GeoRegion[];
  countries: GeoCountry[];
  states: GeoState[];
  cities: GeoCity[];
  articles: GeoArticle[];
}

// ─── ISO data for feature lookup ──────────────────────────────────────────────
// world-atlas uses numeric ISO-3166-1 IDs; we need alpha-3 → numeric

const ALPHA3_TO_NUMERIC: Record<string, number> = {
  AFG:4,ALB:8,DZA:12,AGO:24,ARG:32,AUS:36,AUT:40,BGD:50,BEL:56,BOL:68,
  BRA:76,BGR:100,KHM:116,CMR:120,CAN:124,LKA:144,CHL:152,CHN:156,COL:170,
  HRV:191,CUB:192,CZE:203,DNK:208,DOM:214,ECU:218,EGY:818,ETH:231,FIN:246,
  FRA:250,DEU:276,GHA:288,GRC:300,GTM:320,HND:340,HUN:348,IND:356,IDN:360,
  IRN:364,IRQ:368,IRL:372,ISR:376,ITA:380,JPN:392,JOR:400,KAZ:398,KEN:404,
  KOR:410,KWT:414,LAO:418,LBN:422,LBY:434,LUX:442,MYS:458,MEX:484,MAR:504,
  MNG:496,NLD:528,NZL:554,NGA:566,NOR:578,PAK:586,PAN:591,PER:604,PHL:608,
  POL:616,PRT:620,QAT:634,ROU:642,RUS:643,SAU:682,SEN:686,SVK:703,SVN:705,
  ZAF:710,ESP:724,SDN:729,SWE:752,CHE:756,SYR:760,TWN:158,THA:764,TTO:780,
  TUN:788,TUR:792,UGA:800,UKR:804,ARE:784,GBR:826,USA:840,URY:858,UZB:860,
  VEN:862,VNM:704,YEM:887,ZMB:894,ZWE:716,BIH:70,SRB:688,MKD:807,MNE:499,
  ALG:12,ISL:352,GEO:268,ARM:51,AZE:31,BLR:112,EST:233,LVA:428,LTU:440,
  MDA:498,CYP:196,MLT:470,BHS:44,JAM:388,BLZ:84,CRI:188,SLV:222,
  NIC:558,PRY:600,GUY:328,SUR:740,
};

// ISO-3 codes grouped by continent / region
const CONTINENT_ISO: Record<string, string[]> = {
  // Exclude Russia & Ukraine to keep centroid in Western/Central Europe
  Europe:        ["AUT","BEL","CHE","CZE","DEU","DNK","ESP","FIN","FRA","GBR","GRC","HUN","ITA","NLD","NOR","POL","PRT","ROU","SWE","SVK","HRV","SVN","BIH","SRB","MKD","MNE","ISL","IRL","LUX","EST","LVA","LTU","MDA","CYP","ALB"],
  // Exclude Central Asia/Caucasus to keep centroid in East/South Asia
  Asia:          ["CHN","IND","IRN","ISR","JPN","KOR","MYS","PAK","SAU","THA","ARE","IRQ","JOR","LBN","SYR","KWT","QAT","OMN","YEM","BHR","VNM","IDN","PHL","MMR","KHM","LAO","BGD","LKA","NPL","AFG","TWN"],
  "North America":["CAN","MEX","USA","GTM","CRI","CUB","DOM","HND","PAN","SLV","NIC","JAM","BLZ","BHS","TTO"],
  "South America":["ARG","BRA","CHL","COL","ECU","PER","URY","VEN","BOL","PRY","GUY","SUR"],
  Africa:        ["DZA","EGY","ETH","GHA","KEN","MAR","NGA","ZAF","TUN","SDN","SEN","UGA","CMR","CIV","TZA","MOZ","ZMB","ZWE","AGO","MLI","NER","TCD","SOM","LBY"],
  Oceania:       ["AUS","NZL","PNG","FJI"],
};

const REGION_ISO: Record<string, string[]> = {
  "Western Europe":       ["DEU","FRA","GBR","NLD","BEL","CHE","AUT","IRL","LUX"],
  "Scandinavia":          ["DNK","SWE","NOR","FIN","ISL"],
  "Southern Europe":      ["ITA","ESP","PRT","GRC","HRV","SVN","MNE","ALB","MKD","BIH","SRB","CYP","MLT"],
  "Eastern Europe":       ["POL","CZE","SVK","HUN","ROU","BGR","UKR","BLR","EST","LVA","LTU","MDA"],
  "East Asia":            ["CHN","JPN","KOR","TWN","MNG"],
  "Middle East":          ["IRN","ISR","SAU","TUR","ARE","IRQ","JOR","LBN","SYR","KWT","QAT","OMN","YEM","BHR"],
  "South Asia":           ["IND","PAK","BGD","LKA","NPL","AFG"],
  "Southeast Asia":       ["MYS","SGP","THA","VNM","IDN","PHL","MMR","KHM","LAO","BRN"],
  "Russia & Central Asia":["RUS","KAZ","UZB","TKM","KGZ","TJK","MNG","GEO","ARM","AZE"],
  "Northern America":     ["USA","CAN"],
  "Central America":      ["MEX","GTM","CRI","CUB","DOM","HND","PAN","SLV","NIC","JAM","BLZ","BHS","TTO"],
  "South America":        ["BRA","ARG","CHL","COL","ECU","PER","URY","VEN","BOL","PRY","GUY","SUR"],
  "North Africa":         ["EGY","DZA","MAR","TUN","LBY","SDN"],
  "Sub-Saharan Africa":   ["ZAF","NGA","KEN","GHA","ETH","TZA","UGA","CMR","CIV","SEN","MOZ","ZMB","ZWE","AGO"],
  "Oceania":              ["AUS","NZL","PNG","FJI"],
};

// country name → ISO-3
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  "United States":"USA","China":"CHN","Denmark":"DNK","France":"FRA","Germany":"DEU",
  "Japan":"JPN","Italy":"ITA","United Kingdom":"GBR","Canada":"CAN","Brazil":"BRA",
  "Switzerland":"CHE","Turkey":"TUR","Iran":"IRN","Netherlands":"NLD","Sweden":"SWE",
  "India":"IND","South Korea":"KOR","Russia":"RUS","Mexico":"MEX","Spain":"ESP",
  "Norway":"NOR","Finland":"FIN","Poland":"POL","Austria":"AUT","Belgium":"BEL",
  "Portugal":"PRT","Greece":"GRC","Saudi Arabia":"SAU","Australia":"AUS",
  "New Zealand":"NZL","Argentina":"ARG","Colombia":"COL","Chile":"CHL",
  "South Africa":"ZAF","Egypt":"EGY","Israel":"ISR","Malaysia":"MYS",
  "Singapore":"SGP","Thailand":"THA","Pakistan":"PAK","Kazakhstan":"KAZ",
  "Indonesia":"IDN","Vietnam":"VNM","Philippines":"PHL","Bangladesh":"BGD",
};

// ─── D3 Map component ─────────────────────────────────────────────────────────

interface MapItem {
  name: string;
  count: number;
  isoList?: string[]; // for continent/region centroid calculation
  iso?: string;       // for country centroid calculation
}

interface D3MapProps {
  items: MapItem[];
  /** which ISO codes to highlight (tinted land) */
  highlightIso?: string[];
  /** if true: use geoNaturalEarth1 world view; else fitExtent on highlightIso features */
  worldView: boolean;
  onClickItem?: (name: string) => void;
  maxR?: number;
}

// Module-level topology cache — fetched once, reused on drill-down
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _worldTopoCache: any = null;

function D3GeoMap({ items, highlightIso, worldView, onClickItem, maxR = 42 }: D3MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || items.length === 0) return;
    let cancelled = false;

    const loadScript = (src: string, globalKey: string): Promise<void> =>
      new Promise((resolve, reject) => {
        // Already loaded and global is ready
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((window as any)[globalKey]) { resolve(); return; }
        // Script tag exists but global not yet set — wait for it
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          existing.addEventListener("load", () => resolve());
          existing.addEventListener("error", reject);
          return;
        }
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => resolve();
        s.onerror = reject;
        document.head.appendChild(s);
      });

    (async () => {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js", "d3");
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js", "topojson");
      if (cancelled) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d3 = (window as any).d3;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const topojson = (window as any).topojson;

      el.innerHTML = "";

      const W = 900, H = 460;
      const isDark = matchMedia("(prefers-color-scheme:dark)").matches;

      // fetch topology (cached after first load)
      if (!_worldTopoCache) {
        _worldTopoCache = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
      }
      const world = _worldTopoCache;
      if (cancelled) return;

      const allFeatures = topojson.feature(world, world.objects.countries).features;

      // build numeric ID sets for lookup
      const hiNumeric = new Set<number>(
        (highlightIso ?? []).map((a) => ALPHA3_TO_NUMERIC[a]).filter(Boolean)
      );

      // ── projection ──────────────────────────────────────────────────────────
      let projection: unknown;
      if (worldView) {
        projection = d3.geoNaturalEarth1().scale(148).translate([W / 2, H / 2]);
      } else {
        const hiFeatures = allFeatures.filter((f: { id: string | number }) => hiNumeric.has(+f.id));
        const col = {
          type: "FeatureCollection",
          features: hiFeatures.length > 0 ? hiFeatures : allFeatures,
        };
        projection = d3.geoMercator().fitExtent([[30, 30], [W - 30, H - 30]], col);
      }

      const pathGen = d3.geoPath(projection);

      // ── SVG ─────────────────────────────────────────────────────────────────
      const svg = d3.select(el)
        .append("svg")
        .attr("viewBox", `0 0 ${W} ${H}`)
        .attr("width", "100%")
        .style("display", "block")
        .style("border-radius", "10px")
        .style("border", "1px solid #e0e4ec");

      // ocean
      svg.append("path")
        .datum({ type: "Sphere" })
        .attr("d", pathGen)
        .attr("fill", isDark ? "#181c28" : "#d0e4f0");

      // land
      svg.append("g")
        .selectAll("path")
        .data(allFeatures)
        .join("path")
        .attr("d", pathGen)
        .attr("fill", (f: { id: string | number }) => {
          if (hiNumeric.size === 0) return isDark ? "#252830" : "#e4e8f0";
          return hiNumeric.has(+f.id)
            ? (isDark ? "#323a4a" : "#d4dff0")
            : (isDark ? "#1e2230" : "#eaedf4");
        })
        .attr("stroke", isDark ? "#3a3f50" : "#c8cfdc")
        .attr("stroke-width", 0.4);

      // ── tooltip ─────────────────────────────────────────────────────────────
      const tip = d3.select(el)
        .append("div")
        .style("position", "absolute")
        .style("pointer-events", "none")
        .style("display", "none")
        .style("background", isDark ? "#1e2130" : "#fff")
        .style("border", "0.5px solid #ccc")
        .style("border-radius", "8px")
        .style("padding", "8px 12px")
        .style("font-size", "13px")
        .style("z-index", "20")
        .style("white-space", "nowrap");

      // ── bubbles ─────────────────────────────────────────────────────────────
      const maxCount = Math.max(...items.map((i) => i.count), 1);
      const rScale = d3.scaleSqrt().domain([0, maxCount]).range([0, maxR]);

      // compute centroid for each item
      const placed = items
        .map((item) => {
          let xy: [number, number] | null = null;

          if (item.iso) {
            // single country: project its numeric id feature centroid
            const num = ALPHA3_TO_NUMERIC[item.iso];
            const feat = num ? allFeatures.find((f: { id: string | number }) => +f.id === num) : null;
            if (feat) xy = pathGen.centroid(feat);
          } else if (item.isoList && item.isoList.length > 0) {
            // group: merge all matching features into a MultiPolygon centroid
            const nums = new Set(item.isoList.map((a) => ALPHA3_TO_NUMERIC[a]).filter(Boolean));
            const feats = allFeatures.filter((f: { id: string | number }) => nums.has(+f.id));
            if (feats.length > 0) {
              const merged = {
                type: "Feature",
                geometry: {
                  type: "MultiPolygon",
                  coordinates: feats.flatMap((f: { geometry: { type: string; coordinates: unknown[] } }) =>
                    f.geometry.type === "Polygon"
                      ? [f.geometry.coordinates]
                      : f.geometry.coordinates
                  ),
                },
                properties: {},
              };
              xy = pathGen.centroid(merged);
            }
          }

          if (!xy || !isFinite(xy[0]) || !isFinite(xy[1])) return null;
          return { ...item, xy, r: rScale(item.count) };
        })
        .filter(Boolean) as (MapItem & { xy: [number, number]; r: number })[];

      // sort large first so small bubbles render on top
      placed.sort((a, b) => b.count - a.count);

      const bGroup = svg.append("g");

      type PlacedItem = MapItem & { xy: [number, number]; r: number };

      bGroup
        .selectAll("circle")
        .data(placed)
        .join("circle")
        .attr("cx", (d: PlacedItem) => d.xy[0])
        .attr("cy", (d: PlacedItem) => d.xy[1])
        .attr("r", (d: PlacedItem) => d.r)
        .attr("fill", "rgba(192,57,43,0.28)")
        .attr("stroke", "#c0392b")
        .attr("stroke-width", 1.5)
        .style("cursor", onClickItem ? "pointer" : "default")
        .on("mousemove", (event: MouseEvent, d: PlacedItem) => {
          const rect = el.getBoundingClientRect();
          let x = event.clientX - rect.left + 14;
          const y = event.clientY - rect.top - 48;
          if (x + 200 > rect.width) x = event.clientX - rect.left - 210;
          tip
            .style("display", "block")
            .style("left", `${x}px`)
            .style("top", `${y}px`)
            .html(
              `<strong style="color:${isDark ? "#fff" : "#1a2a3a"}">${d.name}</strong><br>` +
              `<span style="color:#c0392b;font-weight:600">${d.count.toLocaleString("da")}</span>` +
              `<span style="color:#888"> forfattere</span>` +
              (onClickItem ? `<br><span style="font-size:11px;color:#aaa">Klik for at zoome ind</span>` : "")
            );
        })
        .on("mouseleave", () => tip.style("display", "none"))
        .on("click", (_: MouseEvent, d: MapItem) => {
          tip.style("display", "none");
          onClickItem?.(d.name);
        });

      // labels for big bubbles
      bGroup
        .selectAll("text")
        .data(placed.filter((d) => d.r > 14))
        .join("text")
        .attr("x", (d: PlacedItem) => d.xy[0])
        .attr("y", (d: PlacedItem) => d.xy[1] + 4)
        .attr("text-anchor", "middle")
        .attr("font-size", (d: PlacedItem) => Math.min(12, Math.max(9, d.r * 0.45)))
        .attr("fill", isDark ? "rgba(255,255,255,0.88)" : "#7a1a0f")
        .attr("font-weight", "500")
        .attr("pointer-events", "none")
        .text((d: PlacedItem) => (d.count >= 1000 ? (d.count / 1000).toFixed(1) + "k" : d.count));
    })();

    return () => {
      cancelled = true;
      el.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(items), JSON.stringify(highlightIso), worldView]);

  return <div ref={containerRef} style={{ position: "relative" }} />;
}

// ─── Sidebar ranking list ─────────────────────────────────────────────────────

function SidebarList({
  items,
  header,
  getHref,
}: {
  items: { name: string; count: number }[];
  header: string;
  getHref: (name: string) => string;
}) {
  const max = items[0]?.count || 1;
  const total = items.reduce((a, b) => a + b.count, 0);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "10px",
        border: "1px solid #e8edf4",
        overflow: "hidden",
        marginTop: "12px",
      }}
    >
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid #f0f3f8",
          background: "#fafbfc",
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.07em",
          textTransform: "uppercase" as const,
          color: "#6b7a8d",
        }}
      >
        {header}
      </div>
      {items.map((item, i) => {
        const pct = Math.round((item.count / max) * 100);
        const share = ((item.count / total) * 100).toFixed(1);
        return (
          <Link
            key={item.name}
            href={getHref(item.name)}
            style={{
              display: "grid",
              gridTemplateColumns: "20px 1fr 62px 46px",
              alignItems: "center",
              gap: "10px",
              padding: "10px 16px",
              textDecoration: "none",
              borderTop: i === 0 ? "none" : "1px solid #f0f3f8",
            }}
          >
            <span style={{ fontSize: "11px", color: "#bbb", fontWeight: 700, textAlign: "center" as const }}>
              {i + 1}
            </span>
            <div>
              <div
                style={{
                  height: "4px",
                  borderRadius: "2px",
                  background: "#f1f3f7",
                  overflow: "hidden",
                  marginBottom: "5px",
                }}
              >
                <div style={{ height: "100%", width: `${pct}%`, background: "#c0392b", borderRadius: "2px" }} />
              </div>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#1a2a3a" }}>{item.name}</span>
            </div>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 700,
                textAlign: "right" as const,
                fontVariantNumeric: "tabular-nums",
                color: "#1a2a3a",
              }}
            >
              {item.count.toLocaleString("da")}
            </span>
            <span style={{ fontSize: "11px", color: "#aab", textAlign: "right" as const }}>{share}%</span>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Bar row (levels 4–5) ─────────────────────────────────────────────────────

function BarRow({
  label,
  count,
  maxCount,
  total,
  href,
  rank,
}: {
  label: string;
  count: number;
  maxCount: number;
  total: number;
  href: string;
  rank: number;
}) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  const share = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
  return (
    <Link
      href={href}
      style={{
        display: "grid",
        gridTemplateColumns: "24px 180px 1fr 60px 46px",
        alignItems: "center",
        gap: "12px",
        padding: "11px 0",
        textDecoration: "none",
        color: "#1a1a1a",
        borderTop: rank === 0 ? "none" : "1px solid #f0f3f8",
      }}
    >
      <span style={{ fontSize: "11px", color: "#bbb", fontWeight: 700, textAlign: "center" as const }}>
        {rank + 1}
      </span>
      <span
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "#1a2a3a",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap" as const,
        }}
      >
        {label}
      </span>
      <div style={{ height: "5px", borderRadius: "3px", background: "#f1f3f7", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "#c0392b", borderRadius: "3px" }} />
      </div>
      <span
        style={{
          fontSize: "13px",
          fontWeight: 700,
          textAlign: "right" as const,
          fontVariantNumeric: "tabular-nums",
          color: "#1a2a3a",
        }}
      >
        {count.toLocaleString("da")}
      </span>
      <span style={{ fontSize: "11px", color: "#aab", textAlign: "right" as const }}>{share}%</span>
    </Link>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GeoExplorer({
  continent,
  region,
  country,
  state,
  city,
  continents,
  regions,
  countries,
  states,
  cities,
  articles,
}: Props) {
  const hasStates = states.length > 0;
  const level =
    city ? 6
    : state ? 5
    : country && hasStates ? 4
    : country ? 5
    : region ? 3
    : continent ? 2
    : 1;

  // ── breadcrumb ──────────────────────────────────────────────────────────────
  const crumbs: { label: string; href: string }[] = [
    { label: "Alle kontinenter", href: "/geo" },
  ];
  if (continent)
    crumbs.push({ label: continent, href: `/geo?continent=${encodeURIComponent(continent)}` });
  if (region)
    crumbs.push({
      label: region,
      href: `/geo?continent=${encodeURIComponent(continent!)}&region=${encodeURIComponent(region)}`,
    });
  if (country)
    crumbs.push({
      label: country,
      href: `/geo?continent=${encodeURIComponent(continent!)}&region=${encodeURIComponent(region!)}&country=${encodeURIComponent(country)}`,
    });
  if (state)
    crumbs.push({
      label: state,
      href: `/geo?continent=${encodeURIComponent(continent!)}&region=${encodeURIComponent(region!)}&country=${encodeURIComponent(country!)}&state=${encodeURIComponent(state)}`,
    });
  if (city) {
    const cityHref = state
      ? `/geo?continent=${encodeURIComponent(continent!)}&region=${encodeURIComponent(region!)}&country=${encodeURIComponent(country!)}&state=${encodeURIComponent(state)}&city=${encodeURIComponent(city)}`
      : `/geo?continent=${encodeURIComponent(continent!)}&region=${encodeURIComponent(region!)}&country=${encodeURIComponent(country!)}&city=${encodeURIComponent(city)}`;
    crumbs.push({ label: city, href: cityHref });
  }
  const backHref = crumbs.length > 1 ? crumbs[crumbs.length - 2].href : null;

  // ── map data ────────────────────────────────────────────────────────────────
  const mapItems: MapItem[] =
    level === 1
      ? continents.map((c) => ({
          name: c.continent,
          count: c.count,
          isoList: CONTINENT_ISO[c.continent] ?? [],
        }))
      : level === 2
      ? regions.map((r) => ({
          name: r.region,
          count: r.count,
          isoList: REGION_ISO[r.region] ?? [],
        }))
      : level === 3
      ? countries.map((c) => ({
          name: c.country,
          count: c.count,
          iso: COUNTRY_NAME_TO_ISO[c.country],
        }))
      : [];

  const highlightIso =
    level === 2 && continent ? CONTINENT_ISO[continent]
    : level === 3 && region ? REGION_ISO[region]
    : undefined;

  const worldView = level === 1;

  // ── totals for sidebar & bar rows ───────────────────────────────────────────
  const total2 = regions.reduce((a, b) => a + b.count, 0);
  const total3 = countries.reduce((a, b) => a + b.count, 0);
  const total4 = states.reduce((a, b) => a + b.count, 0);
  const total5 = cities.reduce((a, b) => a + b.count, 0);

  const levelLabel =
    level === 4 ? `Stater · ${country}`
    : level === 5 ? (state ? `Byer · ${state}, ${country}` : `Byer · ${country}`)
    : `Artikler · ${city}`;

  return (
    <div>
      {/* Back */}
      {backHref && (
        <Link
          href={backHref}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "13px",
            color: "#6b7a8d",
            textDecoration: "none",
            marginBottom: "14px",
          }}
        >
          ← Tilbage
        </Link>
      )}

      {/* Breadcrumb */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px",
          alignItems: "center",
          marginBottom: "18px",
        }}
      >
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={c.href} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              {i > 0 && <span style={{ color: "#ccc", fontSize: "12px" }}>›</span>}
              {isLast ? (
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#1a1a1a" }}>{c.label}</span>
              ) : (
                <Link href={c.href} style={{ fontSize: "13px", color: "#6b7a8d", textDecoration: "none" }}>
                  {c.label}
                </Link>
              )}
            </span>
          );
        })}
      </div>

      {/* ── LEVELS 1–3: Map + sidebar ── */}
      {level <= 3 && (
        <>
          <D3GeoMap
            items={mapItems}
            highlightIso={highlightIso}
            worldView={worldView}
            maxR={level === 1 ? 42 : level === 2 ? 38 : 32}
            onClickItem={
              level === 1
                ? (name) => {
                    window.location.href = `/geo?continent=${encodeURIComponent(name)}`;
                  }
                : level === 2
                ? (name) => {
                    window.location.href = `/geo?continent=${encodeURIComponent(continent!)}&region=${encodeURIComponent(name)}`;
                  }
                : undefined
            }
          />

          {level === 1 && (
            <SidebarList
              items={continents.map((c) => ({ name: c.continent, count: c.count }))}
              header="Kontinenter"
              getHref={(name) => `/geo?continent=${encodeURIComponent(name)}`}
            />
          )}
          {level === 2 && (
            <SidebarList
              items={regions.map((r) => ({ name: r.region, count: r.count }))}
              header={`Regioner i ${continent} · ${total2.toLocaleString("da")} forfattere`}
              getHref={(name) =>
                `/geo?continent=${encodeURIComponent(continent!)}&region=${encodeURIComponent(name)}`
              }
            />
          )}
          {level === 3 && (
            <SidebarList
              items={countries.map((c) => ({ name: c.country, count: c.count }))}
              header={`Lande i ${region} · ${total3.toLocaleString("da")} forfattere`}
              getHref={(name) =>
                `/geo?continent=${encodeURIComponent(continent!)}&region=${encodeURIComponent(region!)}&country=${encodeURIComponent(name)}`
              }
            />
          )}
        </>
      )}

      {/* ── LEVELS 4–5: Bar list ── */}
      {(level === 4 || level === 5) && (
        <div
          style={{
            background: "#fff",
            borderRadius: "10px",
            border: "1px solid #e8edf4",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 24px",
              borderBottom: "1px solid #f0f3f8",
              background: "#fafbfc",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <div
              style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#c0392b" }}
            />
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.07em",
                textTransform: "uppercase" as const,
                color: "#6b7a8d",
              }}
            >
              {levelLabel}
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "24px 180px 1fr 60px 46px",
              gap: "12px",
              padding: "8px 24px",
              borderBottom: "1px solid #f0f3f8",
            }}
          >
            <span style={{ fontSize: "10px", color: "#bbb", fontWeight: 700 }}>#</span>
            <span
              style={{
                fontSize: "10px",
                color: "#bbb",
                fontWeight: 700,
                textTransform: "uppercase" as const,
                letterSpacing: "0.05em",
              }}
            >
              Navn
            </span>
            <span />
            <span
              style={{
                fontSize: "10px",
                color: "#bbb",
                fontWeight: 700,
                textAlign: "right" as const,
                textTransform: "uppercase" as const,
                letterSpacing: "0.05em",
              }}
            >
              Forfattere
            </span>
            <span style={{ fontSize: "10px", color: "#bbb", fontWeight: 700, textAlign: "right" as const }}>
              Andel
            </span>
          </div>
          <div style={{ padding: "4px 24px 16px" }}>
            {level === 4 &&
              states.map((s, i) => (
                <BarRow
                  key={s.state}
                  label={s.state}
                  count={s.count}
                  maxCount={states[0]?.count ?? 1}
                  total={total4}
                  href={`/geo?continent=${encodeURIComponent(continent!)}&region=${encodeURIComponent(region!)}&country=${encodeURIComponent(country!)}&state=${encodeURIComponent(s.state)}`}
                  rank={i}
                />
              ))}
            {level === 5 &&
              cities.map((c, i) => {
                const cityHref = state
                  ? `/geo?continent=${encodeURIComponent(continent!)}&region=${encodeURIComponent(region!)}&country=${encodeURIComponent(country!)}&state=${encodeURIComponent(state)}&city=${encodeURIComponent(c.city)}`
                  : `/geo?continent=${encodeURIComponent(continent!)}&region=${encodeURIComponent(region!)}&country=${encodeURIComponent(country!)}&city=${encodeURIComponent(c.city)}`;
                return (
                  <BarRow
                    key={c.city}
                    label={c.city}
                    count={c.count}
                    maxCount={cities[0]?.count ?? 1}
                    total={total5}
                    href={cityHref}
                    rank={i}
                  />
                );
              })}
          </div>
        </div>
      )}

      {/* ── LEVEL 6: Articles ── */}
      {level === 6 && (
        <div
          style={{
            background: "#fff",
            borderRadius: "10px",
            border: "1px solid #e8edf4",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 24px",
              borderBottom: "1px solid #f0f3f8",
              background: "#fafbfc",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.07em",
                textTransform: "uppercase" as const,
                color: "#6b7a8d",
              }}
            >
              Artikler · {city}
            </span>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#c0392b",
                background: "#fef2f2",
                borderRadius: "20px",
                padding: "2px 10px",
              }}
            >
              {articles.length.toLocaleString("da")} artikler
            </span>
          </div>
          <div style={{ padding: "0 24px 8px" }}>
            {articles.length === 0 ? (
              <div
                style={{ padding: "24px 0", textAlign: "center" as const, color: "#aaa", fontSize: "14px" }}
              >
                Ingen artikler fundet.
              </div>
            ) : (
              articles.map((a, i) => (
                <div
                  key={a.id}
                  style={{
                    padding: "14px 0",
                    borderTop: i === 0 ? "none" : "1px solid #f0f3f8",
                    display: "flex",
                    gap: "14px",
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      color: "#bbb",
                      fontWeight: 700,
                      minWidth: "24px",
                      textAlign: "center" as const,
                      paddingTop: "2px",
                    }}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <Link
                      href={`/articles/${a.id}`}
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "#1a2a3a",
                        textDecoration: "none",
                        lineHeight: 1.4,
                        display: "block",
                      }}
                    >
                      {a.title}
                    </Link>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#8a97a8",
                        marginTop: "4px",
                        display: "flex",
                        gap: "8px",
                      }}
                    >
                      {a.journal_abbr && (
                        <span style={{ fontWeight: 600 }}>{a.journal_abbr}</span>
                      )}
                      {a.published_date && <span>{a.published_date.slice(0, 10)}</span>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
