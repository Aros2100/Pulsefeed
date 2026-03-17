"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { REGION_MAP, getContinent } from "@/lib/geo/continent-map";
import { getStatePolicy } from "@/lib/geo/state-policy";
import { US_STATES } from "@/lib/geo/country-map";

function titleCase(s: string): string {
  return s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const STATES: Record<string, string[]> = {
  "United States": Object.values(US_STATES).sort(),
  "Canada": ["Alberta","British Columbia","Manitoba","New Brunswick",
    "Newfoundland and Labrador","Nova Scotia","Ontario",
    "Prince Edward Island","Quebec","Saskatchewan"],
  "Australia": ["Australian Capital Territory","New South Wales",
    "Northern Territory","Queensland","South Australia",
    "Tasmania","Victoria","Western Australia"],
  "India": ["Andhra Pradesh","Assam","Bihar","Delhi","Gujarat","Haryana",
    "Karnataka","Kerala","Madhya Pradesh","Maharashtra","Odisha","Punjab",
    "Rajasthan","Tamil Nadu","Telangana","Uttar Pradesh","West Bengal"],
  "Brazil": ["Acre","Alagoas","Amapá","Amazonas","Bahia","Ceará",
    "Distrito Federal","Espírito Santo","Goiás","Maranhão","Mato Grosso",
    "Mato Grosso do Sul","Minas Gerais","Pará","Paraíba","Paraná",
    "Pernambuco","Piauí","Rio de Janeiro","Rio Grande do Norte",
    "Rio Grande do Sul","Rondônia","Roraima","Santa Catarina",
    "São Paulo","Sergipe","Tocantins"],
  "China": ["Anhui","Beijing","Chongqing","Fujian","Gansu","Guangdong",
    "Guangxi","Guizhou","Hainan","Hebei","Heilongjiang","Henan","Hubei",
    "Hunan","Inner Mongolia","Jiangsu","Jiangxi","Jilin","Liaoning",
    "Ningxia","Qinghai","Shaanxi","Shandong","Shanghai","Shanxi",
    "Sichuan","Tianjin","Tibet","Xinjiang","Yunnan","Zhejiang"],
  "Japan": ["Aichi","Akita","Aomori","Chiba","Ehime","Fukui","Fukuoka",
    "Fukushima","Gifu","Gunma","Hiroshima","Hokkaido","Hyogo","Ibaraki",
    "Ishikawa","Iwate","Kagawa","Kagoshima","Kanagawa","Kochi","Kumamoto",
    "Kyoto","Mie","Miyagi","Miyazaki","Nagano","Nagasaki","Nara","Niigata",
    "Oita","Okayama","Okinawa","Osaka","Saga","Saitama","Shiga","Shimane",
    "Shizuoka","Tochigi","Tokushima","Tokyo","Tottori","Toyama","Wakayama",
    "Yamagata","Yamaguchi","Yamanashi"],
};

const ALL_CONTINENTS = [...new Set(
  Object.values(REGION_MAP).map((r) => getContinent(r)).filter((c): c is string => c !== null),
)].sort();

const ALL_REGIONS = [...new Set(Object.values(REGION_MAP))].sort();

const ALL_COUNTRIES = [...new Set(Object.keys(REGION_MAP))].map(titleCase).sort();

interface AuthorGeoFilterProps {
  userHospital?: string | null;
  total?: number | null;
}

const sel: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  padding: "8px 12px",
  fontSize: "13px",
  color: "#1a1a1a",
  background: "#fff",
  outline: "none",
  cursor: "pointer",
};

export default function AuthorGeoFilter({ userHospital, total }: AuthorGeoFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const continent = searchParams.get("continent") ?? "";
  const region    = searchParams.get("region")    ?? "";
  const country   = searchParams.get("country")   ?? "";
  const state     = searchParams.get("state")     ?? "";
  const city      = searchParams.get("city")      ?? "";
  const hospital  = searchParams.get("hospital")  ?? "";
  const geoSearch = searchParams.get("geo_search") ?? "";

  const [geoInput, setGeoInput] = useState(geoSearch);
  const [cities,    setCities]    = useState<string[]>([]);
  const [hospitals, setHospitals] = useState<string[]>([]);

  const initializedRef = useRef(false);

  // Default hospital on first mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (!searchParams.get("hospital") && userHospital) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("hospital", userHospital);
      router.replace(`${pathname}?${params.toString()}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync local text inputs ↔ URL
  useEffect(() => { setGeoInput(geoSearch); }, [geoSearch]);

  // Debounce geo_search → URL
  useEffect(() => {
    if (geoInput === geoSearch) return;
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (geoInput) { params.set("geo_search", geoInput); } else { params.delete("geo_search"); }
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`);
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoInput]);

  // Fetch cities + hospitals when country changes
  useEffect(() => {
    if (!country) {
      setCities([]);
      setHospitals([]);
      return;
    }
    const supabase = createClient();
    void Promise.all([
      supabase.from("authors").select("city").eq("country", country).not("city", "is", null).limit(500),
      supabase.from("authors").select("hospital").eq("country", country).not("hospital", "is", null).limit(500),
    ]).then(([cRes, hRes]) => {
      const cityData = (cRes.data ?? []) as { city: string }[];
      const hospData = (hRes.data ?? []) as { hospital: string }[];
      setCities([...new Set(cityData.map((r) => r.city).filter(Boolean))].sort());
      setHospitals([...new Set(hospData.map((r) => r.hospital).filter(Boolean))].sort());
    });
  }, [country]);

  function setGeoParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) { params.set(key, value); } else { params.delete(key); }
    if (key === "continent") {
      params.delete("region"); params.delete("country"); params.delete("state");
      params.delete("city"); params.delete("hospital");
    }
    if (key === "region")  { params.delete("country"); params.delete("state"); params.delete("city"); params.delete("hospital"); }
    if (key === "country") { params.delete("state"); params.delete("city"); params.delete("hospital"); }
    if (key === "city")    { params.delete("hospital"); }
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  function clearAll() {
    const params = new URLSearchParams(searchParams.toString());
    ["continent","region","country","state","city","hospital","geo_search"].forEach((k) => params.delete(k));
    params.delete("page");
    setGeoInput("");
    router.replace(`${pathname}?${params.toString()}`);
  }

  const regionOptions = useMemo(() => {
    if (!continent) return ALL_REGIONS;
    return ALL_REGIONS.filter((r) => getContinent(r) === continent);
  }, [continent]);

  const countryOptions = useMemo(() => {
    if (region) {
      return Object.entries(REGION_MAP)
        .filter(([, r]) => r === region)
        .map(([c]) => titleCase(c))
        .sort();
    }
    if (continent) {
      return Object.entries(REGION_MAP)
        .filter(([, r]) => getContinent(r) === continent)
        .map(([c]) => titleCase(c))
        .sort();
    }
    return ALL_COUNTRIES;
  }, [continent, region]);

  const stateOptions = STATES[country] ?? null;
  const isStateVisible = getStatePolicy(country || null) === "mandatory";

  const activeFilters: { key: string; label: string }[] = [
    { key: "continent",  label: continent },
    { key: "region",     label: region },
    { key: "country",    label: country },
    { key: "state",      label: state },
    { key: "city",       label: city },
    { key: "hospital",   label: hospital },
    { key: "geo_search", label: geoSearch },
  ].filter((f) => f.label);

  const hasActive = activeFilters.length > 0;

  return (
    <div style={{ marginBottom: "16px" }}>
      {/* Geo free-text search */}
      <input
        type="text"
        placeholder="Geo-søgning (land, by, hospital)…"
        value={geoInput}
        onChange={(e) => setGeoInput(e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box" as const,
          border: "1px solid #d1d5db", borderRadius: "8px",
          padding: "8px 12px", fontSize: "13px",
          color: "#1a1a1a", outline: "none", background: "#fff",
          marginBottom: "10px", fontFamily: "inherit",
        }}
      />

      {/* Row 1: Continent, Region, Country */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" as const, marginBottom: "8px" }}>
        <select value={continent} onChange={(e) => setGeoParam("continent", e.target.value)} style={sel}>
          <option value="">Alle verdensdele</option>
          {ALL_CONTINENTS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={region} onChange={(e) => setGeoParam("region", e.target.value)} style={sel}>
          <option value="">Alle regioner</option>
          {regionOptions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>

        <select value={country} onChange={(e) => setGeoParam("country", e.target.value)} style={sel}>
          <option value="">Alle lande</option>
          {countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* State row (animated, mandatory countries only) */}
      <div style={{
        overflow: "hidden",
        maxHeight: isStateVisible ? "60px" : "0",
        opacity: isStateVisible ? 1 : 0,
        transition: "max-height 0.25s ease, opacity 0.2s ease",
        marginBottom: isStateVisible ? "8px" : "0",
      }}>
        {stateOptions && (
          <select value={state} onChange={(e) => setGeoParam("state", e.target.value)} style={sel}>
            <option value="">Alle stater/provinser</option>
            {stateOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {/* Row 2: City, Hospital */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" as const, marginBottom: "10px" }}>
        <select
          value={city}
          onChange={(e) => setGeoParam("city", e.target.value)}
          disabled={!country}
          style={{ ...sel, opacity: !country ? 0.4 : 1 }}
        >
          <option value="">Alle byer</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={hospital}
          onChange={(e) => setGeoParam("hospital", e.target.value)}
          disabled={!country}
          style={{ ...sel, opacity: !country ? 0.4 : 1 }}
        >
          <option value="">Alle hospitaler</option>
          {hospitals.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>

      {/* Active badges + clear all + result count */}
      {(hasActive || total != null) && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" as const }}>
          {activeFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setGeoParam(f.key, "")}
              style={{
                display: "inline-flex", alignItems: "center", gap: "4px",
                fontSize: "12px", padding: "3px 8px", borderRadius: "5px",
                background: "#EEF2F7", color: "#374151",
                border: "1px solid #dde3ed", cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {f.label} <span style={{ color: "#9ca3af" }}>×</span>
            </button>
          ))}
          {hasActive && (
            <button
              onClick={clearAll}
              style={{
                fontSize: "12px", padding: "3px 8px", borderRadius: "5px",
                background: "none", color: "#E83B2A",
                border: "1px solid #fca5a5", cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Nulstil alle
            </button>
          )}
          {total != null && (
            <span style={{ fontSize: "12px", color: "#888", marginLeft: "auto" }}>
              Viser {total.toLocaleString("da-DK")} forfattere
            </span>
          )}
        </div>
      )}
    </div>
  );
}
