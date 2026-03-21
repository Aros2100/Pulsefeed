"use client";

import { useMemo } from "react";
import { COUNTRY_LIST } from "@/lib/geo/country-list";
import { US_STATES } from "@/lib/geo/country-map";
import { getStatePolicy, stateMissing } from "@/lib/geo/state-policy";
import { RAW_INSTITUTIONS } from "@/lib/geo/institution-map";
import { CITY_TO_COUNTRY } from "@/lib/geo/city-map";

// State/province dropdowns for mandatory-state countries
const STATES: Record<string, Record<string, string>> = {
  "United States": US_STATES,
  "Canada": {
    AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick",
    NL: "Newfoundland and Labrador", NS: "Nova Scotia", NT: "Northwest Territories",
    NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec",
    SK: "Saskatchewan", YT: "Yukon",
  },
  "Australia": {
    ACT: "Australian Capital Territory", NSW: "New South Wales", NT: "Northern Territory",
    QLD: "Queensland", SA: "South Australia", TAS: "Tasmania", VIC: "Victoria",
    WA: "Western Australia",
  },
  "India": {
    AP: "Andhra Pradesh", AR: "Arunachal Pradesh", AS: "Assam", BR: "Bihar",
    CG: "Chhattisgarh", GA: "Goa", GJ: "Gujarat", HR: "Haryana", HP: "Himachal Pradesh",
    JH: "Jharkhand", KA: "Karnataka", KL: "Kerala", MP: "Madhya Pradesh", MH: "Maharashtra",
    MN: "Manipur", ML: "Meghalaya", MZ: "Mizoram", NL: "Nagaland", OD: "Odisha",
    PB: "Punjab", RJ: "Rajasthan", SK: "Sikkim", TN: "Tamil Nadu", TS: "Telangana",
    TR: "Tripura", UP: "Uttar Pradesh", UK: "Uttarakhand", WB: "West Bengal",
  },
  "Brazil": {
    AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
    DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão",
    MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará",
    PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro",
    RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
    SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
  },
  "China": {
    AH: "Anhui", BJ: "Beijing", CQ: "Chongqing", FJ: "Fujian", GS: "Gansu",
    GD: "Guangdong", GX: "Guangxi", GZ: "Guizhou", HI: "Hainan", HE: "Hebei",
    HL: "Heilongjiang", HA: "Henan", HB: "Hubei", HN: "Hunan", JS: "Jiangsu",
    JX: "Jiangxi", JL: "Jilin", LN: "Liaoning", NM: "Inner Mongolia", NX: "Ningxia",
    QH: "Qinghai", SN: "Shaanxi", SD: "Shandong", SH: "Shanghai", SX: "Shanxi",
    SC: "Sichuan", TJ: "Tianjin", XZ: "Tibet", XJ: "Xinjiang", YN: "Yunnan", ZJ: "Zhejiang",
  },
  "Japan": {
    Aichi: "Aichi", Akita: "Akita", Aomori: "Aomori", Chiba: "Chiba", Ehime: "Ehime",
    Fukui: "Fukui", Fukuoka: "Fukuoka", Fukushima: "Fukushima", Gifu: "Gifu", Gunma: "Gunma",
    Hiroshima: "Hiroshima", Hokkaido: "Hokkaido", Hyogo: "Hyogo", Ibaraki: "Ibaraki",
    Ishikawa: "Ishikawa", Iwate: "Iwate", Kagawa: "Kagawa", Kagoshima: "Kagoshima",
    Kanagawa: "Kanagawa", Kochi: "Kochi", Kumamoto: "Kumamoto", Kyoto: "Kyoto",
    Mie: "Mie", Miyagi: "Miyagi", Miyazaki: "Miyazaki", Nagano: "Nagano",
    Nagasaki: "Nagasaki", Nara: "Nara", Niigata: "Niigata", Oita: "Oita",
    Okayama: "Okayama", Okinawa: "Okinawa", Osaka: "Osaka", Saga: "Saga",
    Saitama: "Saitama", Shiga: "Shiga", Shimane: "Shimane", Shizuoka: "Shizuoka",
    Tochigi: "Tochigi", Tokushima: "Tokushima", Tokyo: "Tokyo", Tottori: "Tottori",
    Toyama: "Toyama", Wakayama: "Wakayama", Yamagata: "Yamagata",
    Yamaguchi: "Yamaguchi", Yamanashi: "Yamanashi",
  },
};

function getCitiesForCountry(country: string): string[] {
  const set = new Set<string>();
  for (const [, info] of RAW_INSTITUTIONS) {
    if (info.country === country && info.city) set.add(info.city);
  }
  for (const info of Object.values(CITY_TO_COUNTRY)) {
    if (info.country === country && info.city) set.add(info.city);
  }
  return [...set].sort();
}

export interface AuthorGeoFieldsProps {
  values: {
    country: string;
    state: string;
    city: string;
    hospital: string;
    department: string;
  };
  onChange: (field: string, value: string) => void;
  disabled?: boolean;
}

const baseInput: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box" as const,
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "#d1d5db",
  borderRadius: "7px",
  padding: "10px 14px",
  fontSize: "14px",
  color: "#1a1a1a",
  outline: "none",
  background: "#fff",
  fontFamily: "inherit",
};

const lbl: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: 500,
  color: "#1a1a1a",
  marginBottom: "6px",
};

export default function AuthorGeoFields({ values, onChange, disabled }: AuthorGeoFieldsProps) {
  const { country, state, city, hospital, department } = values;

  const cityList = useMemo(() => getCitiesForCountry(country), [country]);
  const hasCityList = cityList.length > 0;
  const cityInList = cityList.includes(city);
  const isFreeCity = hasCityList && city !== "" && !cityInList;

  const stateMap = STATES[country] ?? null;
  const isStateVisible = getStatePolicy(country) === "mandatory";
  const isStateRequired = stateMissing(country, state || null);

  // Normalize state: if stored as abbreviation (e.g. "CA"), map to full name for dropdown
  const normalizedState = useMemo(() => {
    if (!stateMap || !state) return state;
    if (Object.values(stateMap).includes(state)) return state;
    return stateMap[state] ?? state;
  }, [stateMap, state]);

  function handleCountryChange(v: string) {
    onChange("country", v);
    onChange("state", "");
    onChange("city", "");
  }

  const datalistId = `agf-cities-${country.replace(/\s+/g, "-")}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

      {/* Country */}
      <div>
        <label style={lbl}>Land</label>
        <select
          value={country}
          onChange={(e) => handleCountryChange(e.target.value)}
          disabled={disabled}
          style={{ ...baseInput, appearance: "auto" as React.CSSProperties["appearance"] }}
        >
          <option value="">— Vælg land —</option>
          {COUNTRY_LIST.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* State (animated in/out) */}
      <div style={{
        overflow: "hidden",
        maxHeight: isStateVisible ? "120px" : "0",
        opacity: isStateVisible ? 1 : 0,
        transition: "max-height 0.25s ease, opacity 0.2s ease",
      }}>
        <label style={{ ...lbl, color: isStateRequired ? "#dc2626" : "#1a1a1a" }}>
          Stat / Provins{isStateRequired ? " *" : ""}
        </label>
        {stateMap ? (
          <select
            value={normalizedState}
            onChange={(e) => onChange("state", e.target.value)}
            disabled={disabled}
            style={{
              ...baseInput,
              appearance: "auto" as React.CSSProperties["appearance"],
              borderColor: isStateRequired ? "#dc2626" : "#d1d5db",
            }}
          >
            <option value="">— Vælg stat/provins —</option>
            {Object.entries(stateMap)
              .sort(([, a], [, b]) => a.localeCompare(b))
              .map(([abbr, name]) => (
                <option key={abbr} value={name}>{name}</option>
              ))}
          </select>
        ) : (
          <input
            type="text"
            value={state}
            onChange={(e) => onChange("state", e.target.value)}
            disabled={disabled}
            placeholder="f.eks. Bayern"
            style={{ ...baseInput, borderColor: isStateRequired ? "#dc2626" : "#d1d5db" }}
          />
        )}
        {isStateRequired && (
          <div style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}>
            Stat er påkrævet for dette land
          </div>
        )}
      </div>

      {/* City */}
      <div>
        <label style={lbl}>By</label>
        <input
          type="text"
          list={hasCityList ? datalistId : undefined}
          value={city}
          onChange={(e) => onChange("city", e.target.value)}
          disabled={disabled}
          placeholder={hasCityList ? "Vælg eller skriv by…" : "f.eks. København"}
          style={{
            ...baseInput,
            ...(isFreeCity ? { background: "#fffbeb", borderColor: "#d97706" } : {}),
          }}
        />
        {hasCityList && (
          <datalist id={datalistId}>
            {cityList.map((c) => <option key={c} value={c} />)}
          </datalist>
        )}
        {isFreeCity && (
          <div style={{ fontSize: "12px", color: "#d97706", marginTop: "4px" }}>
            By ikke i listen — gemmes som fritekst
          </div>
        )}
      </div>

      {/* Hospital */}
      <div>
        <label style={lbl}>Hospital / Institution (valgfri)</label>
        <input
          type="text"
          value={hospital}
          onChange={(e) => onChange("hospital", e.target.value)}
          disabled={disabled}
          placeholder="f.eks. Rigshospitalet"
          style={baseInput}
        />
      </div>

      {/* Department */}
      <div>
        <label style={lbl}>Afdeling (valgfri)</label>
        <input
          type="text"
          value={department}
          onChange={(e) => onChange("department", e.target.value)}
          disabled={disabled}
          placeholder="f.eks. Neurokirurgisk afdeling"
          style={baseInput}
        />
      </div>

    </div>
  );
}
