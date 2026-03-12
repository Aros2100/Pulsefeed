"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthorSearch, { type AuthorMeta } from "@/components/AuthorSearch";
import { SUBSPECIALTY_OPTIONS } from "@/lib/lab/classification-options";
import { COUNTRY_LIST } from "@/lib/geo/country-list";

const TOTAL_STEPS = 3;

function Spinner() {
  return (
    <svg style={{ height: "16px", width: "16px", animation: "spin 1s linear infinite" }} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

function StepDots({ current }: { current: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center", marginBottom: "6px" }}>
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          style={{
            width: n === current ? "24px" : "8px",
            height: "8px",
            borderRadius: "4px",
            background: n <= current ? "#c0392b" : "#e2e8f0",
            transition: "all 0.3s ease",
          }}
        />
      ))}
    </div>
  );
}

interface SelectedAuthor {
  id: string;
  meta: AuthorMeta;
}

interface Props {
  initialAuthorQuery?: string;
}

export default function OnboardingFlow({ initialAuthorQuery = "" }: Props) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [authorLinked, setAuthorLinked] = useState(false);

  // Step 1
  const [selectedAuthor, setSelectedAuthor] = useState<SelectedAuthor | null>(null);

  // Step 2
  const [country, setCountry] = useState("Denmark");
  const [city, setCity] = useState("");
  const [hospital, setHospital] = useState("");

  // Step 3
  const [selectedSubspecialties, setSelectedSubspecialties] = useState<string[]>([]);

  // Submission
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  async function callApi(body: Record<string, unknown>) {
    setLoading(true);
    setServerError(null);
    try {
      const res = await fetch("/api/users/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setServerError(data.error ?? "Noget gik galt. Prøv igen.");
        return false;
      }
      return true;
    } catch {
      setServerError("Netværksfejl. Prøv igen.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  // Step 1 handlers
  async function handleAuthorSelect(authorId: string, meta: AuthorMeta) {
    setSelectedAuthor({ id: authorId, meta });
  }

  async function confirmAuthor() {
    if (!selectedAuthor) return;
    const ok = await callApi({ step: "author", authorId: selectedAuthor.id });
    if (ok) {
      setAuthorLinked(true);
      setCurrentStep(3); // skip step 2
    }
  }

  function handleAuthorSkip() {
    setSelectedAuthor(null);
    setCurrentStep(2);
  }

  // Step 2 handler
  async function handleGeoSubmit() {
    const ok = await callApi({
      step: "geo",
      country: country || null,
      city: city.trim() || null,
      hospital: hospital.trim() || null,
    });
    if (ok) setCurrentStep(3);
  }

  // Step 3 handler
  async function handleComplete() {
    const ok = await callApi({
      step: "complete",
      subspecialties: selectedSubspecialties,
    });
    if (ok) router.replace("/");
  }

  function toggleSubspecialty(s: string) {
    setSelectedSubspecialties((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  const headings = [
    "Find dine publikationer",
    "Fortæl os hvor du arbejder",
    "Hvilke områder interesserer dig?",
  ];
  const subcopy = [
    "Vi søger i vores database med over 62.000 forfattere",
    "Så kan vi vise dig artikler fra dit lokalområde",
    "Vælg de subspecialer du vil følge (du kan ændre det senere)",
  ];

  const btnPrimary: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    width: "100%",
    height: "44px",
    background: "#1a1a1a",
    color: "#fff",
    border: "none",
    borderRadius: "7px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  };

  const btnSecondary: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "44px",
    padding: "0 20px",
    background: "#fff",
    color: "#1a1a1a",
    border: "1px solid #1a1a1a",
    borderRadius: "7px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #d1d5db",
    borderRadius: "7px",
    padding: "10px 14px",
    fontSize: "14px",
    color: "#1a1a1a",
    outline: "none",
    background: "#fff",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "13px",
    fontWeight: 500,
    color: "#1a1a1a",
    marginBottom: "6px",
  };

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "10px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
        overflow: "hidden",
      }}
    >
      {/* Card header */}
      <div style={{ background: "#EEF2F7", borderBottom: "1px solid #e2e6ea", padding: "14px 24px" }}>
        <StepDots current={currentStep} />
        <p style={{ fontSize: "12px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0, textAlign: "center" }}>
          Step {currentStep} af {TOTAL_STEPS}
        </p>
      </div>

      {/* Card body */}
      <div style={{ padding: "28px 24px", transition: "opacity 0.2s ease" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a", margin: "0 0 4px" }}>
          {headings[currentStep - 1]}
        </h1>
        <p style={{ fontSize: "14px", color: "#888", margin: "0 0 24px" }}>
          {subcopy[currentStep - 1]}
        </p>

        {serverError && (
          <div style={{ border: "1px solid #fca5a5", background: "#fef2f2", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px" }}>
            <p style={{ fontSize: "13px", color: "#b91c1c", margin: 0 }}>{serverError}</p>
          </div>
        )}

        {/* ── Step 1: Find forfatter ── */}
        {currentStep === 1 && (
          <div>
            {selectedAuthor ? (
              <div>
                <div style={{
                  border: "1.5px solid #c0392b",
                  borderRadius: "10px",
                  padding: "16px 18px",
                  background: "#fff8f7",
                  marginBottom: "20px",
                }}>
                  <p style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#c0392b", margin: "0 0 6px" }}>
                    Vi fandt din profil
                  </p>
                  <p style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a1a", margin: "0 0 4px" }}>
                    {selectedAuthor.meta.name}
                  </p>
                  {[selectedAuthor.meta.hospital, selectedAuthor.meta.city, selectedAuthor.meta.country].some(Boolean) && (
                    <p style={{ fontSize: "13px", color: "#555", margin: 0 }}>
                      {[selectedAuthor.meta.hospital, selectedAuthor.meta.city, selectedAuthor.meta.country].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void confirmAuthor()}
                  disabled={loading}
                  style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }}
                >
                  {loading ? <Spinner /> : null}
                  {loading ? "Gemmer…" : "Fortsæt"}
                </button>

                <div style={{ textAlign: "center", marginTop: "14px" }}>
                  <button
                    type="button"
                    onClick={() => setSelectedAuthor(null)}
                    style={{ background: "none", border: "none", padding: 0, fontSize: "13px", color: "#888", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "2px" }}
                  >
                    Det er ikke mig — søg igen
                  </button>
                </div>
              </div>
            ) : (
              <AuthorSearch
                initialQuery={initialAuthorQuery}
                onSelect={handleAuthorSelect}
                onSkip={handleAuthorSkip}
                skipLabel="Jeg kan ikke finde mig selv"
              />
            )}
          </div>
        )}

        {/* ── Step 2: Geo data ── */}
        {currentStep === 2 && (
          <div>
            <div style={{ marginBottom: "16px" }}>
              <label htmlFor="onb-country" style={labelStyle}>Land</label>
              <select
                id="onb-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                style={{ ...inputStyle, appearance: "auto" }}
              >
                <option value="">Vælg land…</option>
                {COUNTRY_LIST.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label htmlFor="onb-city" style={labelStyle}>By</label>
              <input
                id="onb-city"
                type="text"
                placeholder="f.eks. København"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label htmlFor="onb-hospital" style={labelStyle}>Hospital / Institution</label>
              <input
                id="onb-hospital"
                type="text"
                placeholder="f.eks. Rigshospitalet"
                value={hospital}
                onChange={(e) => setHospital(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                disabled={loading}
                style={{ ...btnSecondary, opacity: loading ? 0.4 : 1 }}
              >
                Tilbage
              </button>
              <button
                type="button"
                onClick={() => void handleGeoSubmit()}
                disabled={loading}
                style={{ ...btnPrimary, flex: 1, width: "auto", opacity: loading ? 0.6 : 1 }}
              >
                {loading ? <Spinner /> : null}
                {loading ? "Gemmer…" : "Næste"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Subspecialer ── */}
        {currentStep === 3 && (
          <div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "8px",
              marginBottom: "24px",
            }}>
              {SUBSPECIALTY_OPTIONS.map((s) => {
                const checked = selectedSubspecialties.includes(s);
                return (
                  <label
                    key={s}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: checked ? "1.5px solid #c0392b" : "1px solid #e2e6ea",
                      background: checked ? "#fff8f7" : "#fff",
                      cursor: "pointer",
                      transition: "border-color 0.15s, background 0.15s",
                      fontSize: "13px",
                      color: checked ? "#c0392b" : "#1a1a1a",
                      fontWeight: checked ? 600 : 400,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSubspecialty(s)}
                      style={{ display: "none" }}
                    />
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "18px",
                      height: "18px",
                      borderRadius: "4px",
                      border: checked ? "2px solid #c0392b" : "2px solid #d1d5db",
                      background: checked ? "#c0392b" : "#fff",
                      flexShrink: 0,
                      transition: "all 0.15s ease",
                    }}>
                      {checked && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span style={{ lineHeight: 1.3 }}>{s}</span>
                  </label>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setCurrentStep(authorLinked ? 1 : 2)}
                disabled={loading}
                style={{ ...btnSecondary, opacity: loading ? 0.4 : 1 }}
              >
                Tilbage
              </button>
              <button
                type="button"
                onClick={() => void handleComplete()}
                disabled={loading}
                style={{ ...btnPrimary, flex: 1, width: "auto", opacity: loading ? 0.6 : 1 }}
              >
                {loading ? <Spinner /> : null}
                {loading ? "Gemmer…" : "Kom i gang"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
