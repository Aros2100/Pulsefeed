"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { REGION_MAP, getContinent } from "@/lib/geo/continent-map";

interface GeoMap {
  regions:            string[];
  regionToCountries:  Record<string, string[]>;
  countryToCities:    Record<string, string[]>;
  cityToInstitutions: Record<string, string[]>;
}

interface ArticleGeoFilterProps {
  geoMap:        GeoMap;
  userHospital?: string | null;
}

const sel: React.CSSProperties = {
  border: "1px solid #dde3ed",
  borderRadius: "6px",
  padding: "6px 10px",
  fontSize: "12px",
  color: "#1a1a1a",
  background: "#fff",
  outline: "none",
  cursor: "pointer",
  maxWidth: "200px",
};

export default function ArticleGeoFilter({ geoMap, userHospital }: ArticleGeoFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const continent = searchParams.get("continent") ?? "";
  const region    = searchParams.get("region")    ?? "";
  const country   = searchParams.get("country")   ?? "";
  const city      = searchParams.get("city")      ?? "";
  const hospital  = searchParams.get("hospital")  ?? "";
  const geoSearch = searchParams.get("geo_search") ?? "";

  const [geoInput, setGeoInput] = useState(geoSearch);
  const initializedRef = useRef(false);

  // Mark as initialized on first mount
  useEffect(() => {
    initializedRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync geoInput ↔ URL
  useEffect(() => { setGeoInput(geoSearch); }, [geoSearch]);

  // Debounce geo_search → URL
  useEffect(() => {
    if (geoInput === geoSearch) return;
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (geoInput) { params.set("geo_search", geoInput); } else { params.delete("geo_search"); }
      params.delete("page");
      router.push(`/articles?${params.toString()}`);
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoInput]);

  function setGeoParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) { params.set(key, value); } else { params.delete(key); }
    if (key === "continent") {
      params.delete("region"); params.delete("country"); params.delete("city"); params.delete("hospital");
    }
    if (key === "region")  { params.delete("country"); params.delete("city"); params.delete("hospital"); }
    if (key === "country") { params.delete("city"); params.delete("hospital"); }
    if (key === "city")    { params.delete("hospital"); }
    params.delete("page");
    router.push(`/articles?${params.toString()}`);
  }

  function clearAll() {
    const params = new URLSearchParams(searchParams.toString());
    ["continent","region","country","city","hospital","geo_search"].forEach((k) => params.delete(k));
    params.delete("page");
    setGeoInput("");
    router.push(`/articles?${params.toString()}`);
  }

  // Continent options derived from the regions that actually exist in geoMap
  const continentOptions = useMemo(() => {
    return [...new Set(
      geoMap.regions.map((r) => getContinent(r)).filter((c): c is string => c !== null),
    )].sort();
  }, [geoMap.regions]);

  // All continents from REGION_MAP for fallback
  const allMapContinents = useMemo(() => {
    return [...new Set(
      Object.values(REGION_MAP).map((r) => getContinent(r)).filter((c): c is string => c !== null),
    )].sort();
  }, []);

  const effectiveContinents = continentOptions.length > 0 ? continentOptions : allMapContinents;

  const regionOptions = useMemo(() => {
    if (!continent) return geoMap.regions;
    return geoMap.regions.filter((r) => getContinent(r) === continent);
  }, [continent, geoMap.regions]);

  const countryOptions = useMemo(() => {
    if (!region) return [];
    return geoMap.regionToCountries[region] ?? [];
  }, [region, geoMap.regionToCountries]);

  const cityOptions = useMemo(() => {
    if (!country) return [];
    return geoMap.countryToCities[country] ?? [];
  }, [country, geoMap.countryToCities]);

  const hospitalOptions = useMemo(() => {
    if (!city) return [];
    return geoMap.cityToInstitutions[city] ?? [];
  }, [city, geoMap.cityToInstitutions]);

  const activeFilters: { key: string; label: string }[] = [
    { key: "continent",  label: continent },
    { key: "region",     label: region },
    { key: "country",    label: country },
    { key: "city",       label: city },
    { key: "hospital",   label: hospital },
    { key: "geo_search", label: geoSearch },
  ].filter((f) => f.label);

  const hasActive = activeFilters.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: "8px" }}>
      {/* Geo free-text search */}
      <input
        type="text"
        placeholder="Geo-søgning…"
        value={geoInput}
        onChange={(e) => setGeoInput(e.target.value)}
        style={{
          border: "1px solid #dde3ed", borderRadius: "6px",
          padding: "6px 10px", fontSize: "12px",
          color: "#1a1a1a", outline: "none", background: "#fff",
          maxWidth: "220px", fontFamily: "inherit",
        }}
      />

      {/* Row: Continent, Region, Country */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" as const }}>
        <select value={continent} onChange={(e) => setGeoParam("continent", e.target.value || null)} style={sel}>
          <option value="">Alle verdensdele</option>
          {effectiveContinents.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={region} onChange={(e) => setGeoParam("region", e.target.value || null)} style={sel}>
          <option value="">Alle regioner</option>
          {regionOptions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>

        <select
          value={country}
          onChange={(e) => setGeoParam("country", e.target.value || null)}
          disabled={!region}
          style={{ ...sel, opacity: !region ? 0.4 : 1 }}
        >
          <option value="">Alle lande</option>
          {countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Row: City, Hospital */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" as const }}>
        <select
          value={city}
          onChange={(e) => setGeoParam("city", e.target.value || null)}
          disabled={!country}
          style={{ ...sel, opacity: !country ? 0.4 : 1 }}
        >
          <option value="">Alle byer</option>
          {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={hospital}
          onChange={(e) => setGeoParam("hospital", e.target.value || null)}
          disabled={!city}
          style={{ ...sel, opacity: !city ? 0.4 : 1 }}
        >
          <option value="">Alle institutioner</option>
          {hospitalOptions.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>

      {/* Active filter badges */}
      {hasActive && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" as const }}>
          {activeFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setGeoParam(f.key, null)}
              style={{
                display: "inline-flex", alignItems: "center", gap: "3px",
                fontSize: "11px", padding: "2px 7px", borderRadius: "4px",
                background: "#EEF2F7", color: "#374151",
                border: "1px solid #dde3ed", cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {f.label} <span style={{ color: "#9ca3af" }}>×</span>
            </button>
          ))}
          <button
            onClick={clearAll}
            style={{
              fontSize: "11px", padding: "2px 7px", borderRadius: "4px",
              background: "none", color: "#E83B2A",
              border: "1px solid #fca5a5", cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Nulstil alle
          </button>
        </div>
      )}
    </div>
  );
}
