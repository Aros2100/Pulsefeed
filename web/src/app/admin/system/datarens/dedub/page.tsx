"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface DupGroup {
  author_ids: string[];
  display_names: string[];
  group_size: number;
}

interface RepAuthor {
  id: string;
  display_name: string | null;
  country: string | null;
  city: string | null;
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f5f7fa" }}>
      <span style={{ fontSize: "13px", color: "#374151" }}>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        style={{
          width: "40px", height: "22px", borderRadius: "11px", border: "none",
          cursor: "pointer", position: "relative" as const, padding: 0, flexShrink: 0,
          background: value ? "#E83B2A" : "#d1d5db",
          transition: "background 0.15s",
        }}
      >
        <span style={{
          position: "absolute" as const, top: "3px",
          left: value ? "21px" : "3px",
          width: "16px", height: "16px", borderRadius: "50%",
          background: "#fff", display: "block",
          transition: "left 0.15s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </button>
    </div>
  );
}

export default function DedubPage() {
  // Step flow
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [countries, setCountries] = useState<string[]>([]);
  const [countrySearch, setCountrySearch] = useState("");
  const [loadingCountries, setLoadingCountries] = useState(false);

  // Parameters
  const [matchCountry,  setMatchCountry]  = useState(true);
  const [matchState,    setMatchState]    = useState(false);
  const [matchCity,     setMatchCity]     = useState(true);
  const [matchHospital, setMatchHospital] = useState(false);
  const [lastNameChars, setLastNameChars] = useState(4);
  const [maxGroupSize,  setMaxGroupSize]  = useState(8);

  // Results
  const [loading,    setLoading]    = useState(false);
  const [groups,     setGroups]     = useState<DupGroup[]>([]);
  const [repAuthors, setRepAuthors] = useState<Map<string, RepAuthor>>(new Map());
  const [searched,   setSearched]   = useState(false);
  const [err,        setErr]        = useState<string | null>(null);

  useEffect(() => {
    setLoadingCountries(true);
    fetch("/api/admin/dedub/countries")
      .then((r) => r.json() as Promise<{ ok: boolean; countries: string[] }>)
      .then((data) => { setCountries(data.countries ?? []); })
      .catch(() => { /* silent */ })
      .finally(() => setLoadingCountries(false));
  }, []);

  const filteredCountries = countries.filter((c) =>
    c.toLowerCase().includes(countrySearch.toLowerCase())
  );

  async function search() {
    if (!selectedCountry) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/dedub/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_match_country:   matchCountry,
          p_match_state:     matchState,
          p_match_city:      matchCity,
          p_match_hospital:  matchHospital,
          p_last_name_chars: lastNameChars,
          p_max_group_size:  maxGroupSize,
          p_country:         selectedCountry,
        }),
      });
      const data = await res.json() as { ok: boolean; groups?: DupGroup[]; repAuthors?: RepAuthor[]; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Ukendt fejl");

      setGroups(data.groups ?? []);
      const map = new Map<string, RepAuthor>();
      for (const a of data.repAuthors ?? []) map.set(a.id, a);
      setRepAuthors(map);
      setSearched(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ukendt fejl");
    }
    setLoading(false);
  }

  return (
    <div style={{ fontFamily: "var(--font-inter), Inter, sans-serif", background: "#f5f7fa", color: "#1a1a1a", minHeight: "100vh" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <Link href="/admin/datarens" style={{ fontSize: "12px", color: "#888", textDecoration: "none" }}>← Datarens</Link>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#E83B2A", textTransform: "uppercase" as const, fontWeight: 700, marginTop: "8px", marginBottom: "4px" }}>
            Datarens
          </div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>Dedub</h1>
        </div>

        {/* ── STEP 1: Country selection ── */}
        {step === 1 && (
          <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", padding: "24px", marginBottom: "24px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "12px" }}>
              Vælg land
            </div>

            <input
              type="text"
              placeholder="Søg efter land…"
              value={countrySearch}
              onChange={(e) => setCountrySearch(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "10px 14px", borderRadius: "8px",
                border: "1px solid #d1d5db", fontSize: "14px",
                fontFamily: "inherit", outline: "none",
                marginBottom: "8px",
              }}
            />

            {loadingCountries ? (
              <div style={{ padding: "20px", textAlign: "center", color: "#9ca3af", fontSize: "13px" }}>Indlæser lande…</div>
            ) : (
              <div style={{ maxHeight: "280px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                {filteredCountries.map((c) => (
                  <div
                    key={c}
                    onClick={() => setSelectedCountry(c)}
                    style={{
                      padding: "10px 14px", cursor: "pointer", fontSize: "14px",
                      background: selectedCountry === c ? "#fef2f2" : "transparent",
                      color: selectedCountry === c ? "#E83B2A" : "#374151",
                      fontWeight: selectedCountry === c ? 600 : 400,
                      borderBottom: "1px solid #f3f4f6",
                    }}
                  >
                    {c}
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #f0f0f0" }}>
              <button
                type="button"
                onClick={() => { if (selectedCountry) setStep(2); }}
                disabled={!selectedCountry}
                style={{
                  padding: "10px 24px", borderRadius: "7px", border: "none",
                  fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
                  cursor: selectedCountry ? "pointer" : "not-allowed",
                  background: selectedCountry ? "#E83B2A" : "#f1f3f7",
                  color: selectedCountry ? "#fff" : "#9ca3af",
                  transition: "background 0.15s",
                }}
              >
                Næste →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Parameters + results ── */}
        {step === 2 && (
          <>
            {/* Country header */}
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "20px" }}>
              <button
                type="button"
                onClick={() => { setStep(1); setSearched(false); setGroups([]); setErr(null); }}
                style={{
                  background: "none", border: "none", fontSize: "13px", color: "#888",
                  cursor: "pointer", padding: 0, fontFamily: "inherit",
                }}
              >
                ← Skift land
              </button>
              <div style={{ fontSize: "16px", fontWeight: 700 }}>
                Dubletter i: <span style={{ color: "#E83B2A" }}>{selectedCountry}</span>
              </div>
            </div>

            {/* Parameters */}
            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", padding: "24px", marginBottom: "24px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "#5a6a85", marginBottom: "12px" }}>
                Parametre
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 48px" }}>
                <div>
                  <Toggle label="Samme land"     value={matchCountry}  onChange={setMatchCountry} />
                  <Toggle label="Samme stat"     value={matchState}    onChange={setMatchState} />
                  <Toggle label="Samme by"       value={matchCity}     onChange={setMatchCity} />
                  <Toggle label="Samme hospital" value={matchHospital} onChange={setMatchHospital} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "20px", justifyContent: "center" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>Efternavn-tegn</span>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "#E83B2A" }}>{lastNameChars}</span>
                    </div>
                    <input
                      type="range" min={1} max={10} value={lastNameChars}
                      onChange={(e) => setLastNameChars(Number(e.target.value))}
                      style={{ width: "100%", accentColor: "#E83B2A" }}
                    />
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>Maks. gruppe-størrelse</span>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "#E83B2A" }}>{maxGroupSize}</span>
                    </div>
                    <input
                      type="range" min={2} max={20} value={maxGroupSize}
                      onChange={(e) => setMaxGroupSize(Number(e.target.value))}
                      style={{ width: "100%", accentColor: "#E83B2A" }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: "16px" }}>
                <button
                  type="button"
                  onClick={() => { void search(); }}
                  disabled={loading}
                  style={{
                    padding: "10px 24px", borderRadius: "7px", border: "none",
                    fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
                    cursor: loading ? "not-allowed" : "pointer",
                    background: loading ? "#f1f3f7" : "#E83B2A",
                    color: loading ? "#9ca3af" : "#fff",
                    transition: "background 0.15s",
                  }}
                >
                  {loading ? "Søger…" : "Søg dubletter"}
                </button>
                {err && <span style={{ fontSize: "12px", color: "#b91c1c" }}>{err}</span>}
              </div>
            </div>

            {/* Results */}
            {searched && (
              <div>
                <div style={{ fontSize: "13px", color: "#888", marginBottom: "14px", fontWeight: 600 }}>
                  {groups.length} forfattergrupper fundet
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {groups.map((group, i) => {
                    const rep = repAuthors.get(group.author_ids[0]);
                    const encoded = btoa(JSON.stringify(group.author_ids));
                    return (
                      <Link
                        key={i}
                        href={`/admin/datarens/dedub/group?ids=${encoded}`}
                        style={{ textDecoration: "none", color: "inherit" }}
                      >
                        <div style={{
                          background: "#fff", borderRadius: "10px", border: "1px solid #e5e7eb",
                          padding: "14px 18px",
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          cursor: "pointer",
                        }}>
                          <div>
                            <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "2px" }}>
                              {group.display_names[0] ?? "—"}
                            </div>
                            {(rep?.city || rep?.country) && (
                              <div style={{ fontSize: "12px", color: "#888" }}>
                                {[rep?.city, rep?.country].filter(Boolean).join(", ")}
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                            <span style={{
                              fontSize: "11px", fontWeight: 700,
                              background: "#E83B2A14", color: "#E83B2A",
                              borderRadius: "4px", padding: "2px 8px",
                            }}>
                              {group.group_size} mulige dubletter
                            </span>
                            <span style={{ fontSize: "18px", color: "#bbb" }}>›</span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
