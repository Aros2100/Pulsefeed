"use client";

import { useState } from "react";
import ProfileEditClient from "./ProfileEditClient";
import ProfilePrivacyClient from "./ProfilePrivacyClient";
import { SUBSPECIALTY_OPTIONS } from "@/lib/lab/classification-options";
import { COUNTRY_LIST } from "@/lib/geo/country-list";
import { showState } from "@/lib/geo/state-policy";

const MANDATORY_SUBSPECIALTY = "Neurosurgery";

interface Props {
  email:                     string;
  initialName:               string;
  initialSpecialtySlugs:     string[];
  initialIsPublic:           boolean;
  initialEmailNotifications: boolean;
  articleCount:              number;
  specialtyLabels:           Record<string, string>;
  // Read-only info fields
  roleType:    string | null;
  authorCity:  string | null;
  authorCountry: string | null;
  // New
  initialSubspecialties:     string[];
  initialCountry:            string | null;
  initialCity:               string | null;
  initialState:              string | null;
  initialHospital:           string | null;
  initialDepartment:         string | null;
  hasAuthorId:               boolean;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700, marginBottom: "12px" }}>
      {children}
    </div>
  );
}

function CardHeader({ label }: { label: string }) {
  return (
    <div style={{ background: "#EEF2F7", borderBottom: "1px solid #dde3ed", padding: "10px 24px" }}>
      <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "12px 24px", borderBottom: "1px solid #f0f0f0" }}>
      <div style={{ fontSize: "12px", color: "#888", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>{value}</div>
    </div>
  );
}

function roleLabel(roleType: string | null): string | null {
  if (roleType === "clinician")  return "Clinician";
  if (roleType === "researcher") return "Researcher";
  if (roleType === "both")       return "Clinician & Researcher";
  return null;
}

const card: React.CSSProperties = {
  background: "#fff", borderRadius: "10px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
  overflow: "hidden", marginBottom: "28px",
};

export default function ProfileClient({
  email,
  initialName,
  initialSpecialtySlugs,
  initialIsPublic,
  initialEmailNotifications,
  articleCount,
  specialtyLabels,
  roleType,
  authorCity,
  authorCountry,
  initialSubspecialties,
  initialCountry,
  initialCity,
  initialState,
  initialHospital,
  initialDepartment,
  hasAuthorId,
}: Props) {
  const [name,          setName]          = useState(initialName);
  const [specialtySlugs, setSpecialtySlugs] = useState(initialSpecialtySlugs);

  // Subspecialties state
  const [subspecialties, setSubspecialties] = useState<string[]>(initialSubspecialties);
  const [editingSub, setEditingSub] = useState(false);
  const [tempSub, setTempSub] = useState<string[]>(initialSubspecialties);
  const [savingSub, setSavingSub] = useState(false);

  // Location state
  const [geoCountry, setGeoCountry] = useState(initialCountry ?? "");
  const [geoCity, setGeoCity] = useState(initialCity ?? "");
  const [geoState, setGeoState] = useState(initialState ?? "");
  const [geoHospital, setGeoHospital] = useState(initialHospital ?? "");
  const [geoDepartment, setGeoDepartment] = useState(initialDepartment ?? "");
  const [editingGeo, setEditingGeo] = useState(false);
  const [savingGeo, setSavingGeo] = useState(false);

  const role = roleLabel(roleType);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json() as { ok: boolean; error?: string };
    if (!data.ok) throw new Error(data.error ?? "Error");
  }

  function toggleSub(sub: string) {
    setTempSub((prev) => {
      if (prev.includes(sub)) return prev.filter((s) => s !== sub);
      // Max 3 elective (excluding mandatory)
      const elective = prev.filter((s) => s !== MANDATORY_SUBSPECIALTY);
      if (elective.length >= 3 && sub !== MANDATORY_SUBSPECIALTY) return prev;
      return [...prev, sub];
    });
  }

  async function saveSub() {
    setSavingSub(true);
    try {
      const toSave = tempSub.includes(MANDATORY_SUBSPECIALTY) ? tempSub : [MANDATORY_SUBSPECIALTY, ...tempSub];
      await patch({ subspecialties: toSave });
      setSubspecialties(toSave);
      setEditingSub(false);
    } catch { /* ignore */ }
    setSavingSub(false);
  }

  async function saveGeo() {
    setSavingGeo(true);
    try {
      await patch({
        country: geoCountry || null,
        city: geoCity || null,
        state: geoState || null,
        hospital: geoHospital || null,
        department: geoDepartment || null,
      });
      setEditingGeo(false);
    } catch { /* ignore */ }
    setSavingGeo(false);
  }

  const rowStyle: React.CSSProperties = { padding: "14px 24px", borderBottom: "1px solid #f0f0f0" };
  const labelSt: React.CSSProperties = { fontSize: "12px", color: "#888", marginBottom: "2px" };
  const inputStyle: React.CSSProperties = {
    fontSize: "13px", padding: "7px 10px", borderRadius: "6px",
    border: "1px solid #dde3ed", outline: "none", width: "100%",
    maxWidth: "320px", boxSizing: "border-box" as const, fontFamily: "inherit",
  };
  const btnPrimary: React.CSSProperties = { fontSize: "12px", padding: "6px 14px", borderRadius: "6px", background: "#1a1a1a", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit" };
  const btnSecondary: React.CSSProperties = { fontSize: "12px", padding: "6px 14px", borderRadius: "6px", background: "none", color: "#5a6a85", border: "1px solid #dde3ed", cursor: "pointer", fontFamily: "inherit" };
  const editBtn: React.CSSProperties = { fontSize: "12px", color: "#5a6a85", background: "none", border: "1px solid #dde3ed", padding: "5px 12px", borderRadius: "6px", cursor: "pointer", fontFamily: "inherit" };

  const electiveSubs = subspecialties.filter((s) => s !== MANDATORY_SUBSPECIALTY);

  return (
    <>
      {/* ── Account card ─────────────────────────────────── */}
      <SectionLabel>Account</SectionLabel>
      <div style={card}>
        <CardHeader label="Personal information" />
        <div style={{ padding: "4px 0 0" }}>
          <InfoRow label="Email" value={email} />
          {role           && <InfoRow label="Role"    value={role} />}
          {authorCity     && <InfoRow label="City"    value={authorCity} />}
          {authorCountry  && <InfoRow label="Country" value={authorCountry} />}
          <ProfileEditClient
            initialName={name}
            initialSpecialtySlugs={specialtySlugs}
            onNameSaved={setName}
            onSpecialtiesSaved={setSpecialtySlugs}
          />
        </div>
      </div>

      {/* ── Subspecialties card ─────────────────────────── */}
      <SectionLabel>Subspecialties</SectionLabel>
      <div style={card}>
        <CardHeader label="Neurosurgical subspecialties" />
        <div style={rowStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              {editingSub ? (
                <div>
                  {/* Mandatory badge */}
                  <div style={{ marginBottom: "10px" }}>
                    <span style={{ background: "#EEF2F7", borderRadius: "6px", padding: "3px 10px", fontSize: "12px", fontWeight: 600, color: "#5a6a85" }}>
                      {MANDATORY_SUBSPECIALTY} (mandatory)
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                    {SUBSPECIALTY_OPTIONS.map((sub) => {
                      const selected = tempSub.includes(sub);
                      const electiveCount = tempSub.filter((s) => s !== MANDATORY_SUBSPECIALTY).length;
                      const disabled = !selected && electiveCount >= 3;
                      return (
                        <button
                          key={sub}
                          onClick={() => toggleSub(sub)}
                          disabled={disabled}
                          style={{
                            fontSize: "12px", padding: "5px 12px", borderRadius: "6px",
                            cursor: disabled ? "not-allowed" : "pointer",
                            background: selected ? "#2563eb" : disabled ? "#f9fafb" : "#f5f7fa",
                            color: selected ? "#fff" : disabled ? "#c0c0c0" : "#5a6a85",
                            border: selected ? "1px solid #2563eb" : "1px solid #dde3ed",
                            fontFamily: "inherit",
                          }}
                        >
                          {sub}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "10px" }}>
                    Max 3 subspecialties (+ mandatory Neurosurgery)
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={saveSub} disabled={savingSub} style={btnPrimary}>
                      {savingSub ? "..." : "Save"}
                    </button>
                    <button onClick={() => { setTempSub(subspecialties); setEditingSub(false); }} style={btnSecondary}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {subspecialties.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      <span style={{ background: "#EEF2F7", borderRadius: "6px", padding: "3px 10px", fontSize: "12px", fontWeight: 600, color: "#5a6a85" }}>
                        {MANDATORY_SUBSPECIALTY}
                      </span>
                      {electiveSubs.map((sub) => (
                        <span key={sub} style={{ background: "#dbeafe", borderRadius: "6px", padding: "3px 10px", fontSize: "12px", fontWeight: 600, color: "#1e40af" }}>
                          {sub}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#9ca3af" }}>No subspecialties configured</div>
                  )}
                </div>
              )}
            </div>
            {!editingSub && (
              <button onClick={() => { setTempSub(subspecialties); setEditingSub(true); }} style={editBtn}>
                Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Location card ──────────────────────────────── */}
      <SectionLabel>Location</SectionLabel>
      <div style={card}>
        <CardHeader label={hasAuthorId ? "Location (syncs to author profile)" : "Location"} />
        <div style={rowStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              {editingGeo ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <div style={labelSt}>Country</div>
                    <select
                      value={geoCountry}
                      onChange={(e) => setGeoCountry(e.target.value)}
                      style={{ ...inputStyle, appearance: "auto" }}
                    >
                      <option value="">— Select country —</option>
                      {COUNTRY_LIST.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div style={labelSt}>City</div>
                    <input value={geoCity} onChange={(e) => setGeoCity(e.target.value)} style={inputStyle} />
                  </div>
                  {showState(geoCountry || null) && (
                    <div>
                      <div style={labelSt}>State / Province</div>
                      <input value={geoState} onChange={(e) => setGeoState(e.target.value)} style={inputStyle} />
                    </div>
                  )}
                  <div>
                    <div style={labelSt}>Hospital / Institution (optional)</div>
                    <input value={geoHospital} onChange={(e) => setGeoHospital(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <div style={labelSt}>Department (optional)</div>
                    <input value={geoDepartment} onChange={(e) => setGeoDepartment(e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                    <button onClick={saveGeo} disabled={savingGeo} style={btnPrimary}>
                      {savingGeo ? "..." : "Save"}
                    </button>
                    <button onClick={() => {
                      setGeoCountry(initialCountry ?? "");
                      setGeoCity(initialCity ?? "");
                      setGeoState(initialState ?? "");
                      setGeoHospital(initialHospital ?? "");
                      setGeoDepartment(initialDepartment ?? "");
                      setEditingGeo(false);
                    }} style={btnSecondary}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {geoCountry && <InfoRow label="Country" value={geoCountry} />}
                  {geoCity && <InfoRow label="City" value={geoCity} />}
                  {showState(geoCountry || null) && geoState && <InfoRow label="State / Province" value={geoState} />}
                  {geoHospital && <InfoRow label="Hospital" value={geoHospital} />}
                  {geoDepartment && <InfoRow label="Department" value={geoDepartment} />}
                  {!geoCountry && !geoCity && !geoHospital && (
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#9ca3af" }}>No location configured</div>
                  )}
                </div>
              )}
            </div>
            {!editingGeo && (
              <button onClick={() => setEditingGeo(true)} style={editBtn}>
                Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Privacy & Notifications card ─────────────────── */}
      <SectionLabel>Privacy & Notifications</SectionLabel>
      <div style={card}>
        <CardHeader label="Profile visibility" />
        <ProfilePrivacyClient
          initialIsPublic={initialIsPublic}
          initialEmailNotifications={initialEmailNotifications}
          name={name}
          specialtySlugs={specialtySlugs}
          articleCount={articleCount}
          specialtyLabels={specialtyLabels}
        />
      </div>
    </>
  );
}
