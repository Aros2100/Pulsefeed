"use client";

import { useState } from "react";
import ProfileAvatarUpload from "./ProfileAvatarUpload";
import ProfilePrivacyClient from "./ProfilePrivacyClient";
import { SUBSPECIALTY_OPTIONS } from "@/lib/lab/classification-options";

const MANDATORY_SUBSPECIALTY: string = "Neurosurgery";

interface Props {
  email:                     string;
  initialName:               string;
  initialTitle:              string;
  initialSpecialtySlugs:     string[];
  initialIsPublic:           boolean;
  initialEmailNotifications: boolean;
  articleCount:              number;
  specialtyLabels:           Record<string, string>;
  roleType:                  string | null;
  authorCity:                string | null;
  authorCountry:             string | null;
  initialSubspecialties:     string[];
  initialCountry:            string | null;
  initialCity:               string | null;
  initialState:              string | null;
  initialHospital:           string | null;
  initialDepartment:         string | null;
  authorId:                  string | null;
  avatarUrl:                 string | null;
  displayName:               string;
  firstArticleDate:          string | null;
  latestArticleDate:         string | null;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const parts = d.split("-");
  const year = parts[0];
  const month = parts[1];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(month, 10) - 1]} ${year}`;
}

const BG   = "#ffffff";
const BG2  = "#EEF2F7";
const BORDER = "1px solid #c8d0dc";
const RADIUS = "10px";

const card: React.CSSProperties = {
  background: BG, border: BORDER, borderRadius: RADIUS,
  overflow: "hidden", marginBottom: "28px",
};
const cardHeader: React.CSSProperties = {
  background: BG2, borderBottom: BORDER,
  padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
};
const sectionLabel: React.CSSProperties = {
  fontSize: "11px", letterSpacing: "0.09em", color: "var(--color-text-secondary)",
  textTransform: "uppercase" as const, fontWeight: 500, marginTop: "28px", marginBottom: "10px",
};
const labelStyle: React.CSSProperties = {
  fontSize: "11px", letterSpacing: "0.09em", color: "var(--color-text-secondary)",
  textTransform: "uppercase" as const, fontWeight: 500, marginBottom: "5px",
};
const valueStyle: React.CSSProperties = {
  fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)",
};
const inputStyle: React.CSSProperties = {
  fontSize: "13px", padding: "7px 10px", borderRadius: "6px",
  border: BORDER, outline: "none", width: "100%",
  boxSizing: "border-box" as const, fontFamily: "inherit",
  background: BG, color: "var(--color-text-primary)",
};
const editBtn: React.CSSProperties = {
  fontSize: "12px", color: "var(--color-text-secondary)", background: "none",
  border: BORDER, padding: "5px 12px", borderRadius: "6px",
  cursor: "pointer", fontFamily: "inherit",
};
const btnPrimary: React.CSSProperties = {
  fontSize: "12px", padding: "6px 14px", borderRadius: "6px",
  background: "var(--color-text-primary)", color: BG,
  border: "none", cursor: "pointer", fontFamily: "inherit",
};
const btnSecondary: React.CSSProperties = {
  fontSize: "12px", padding: "6px 14px", borderRadius: "6px",
  background: "none", color: "var(--color-text-secondary)",
  border: BORDER, cursor: "pointer", fontFamily: "inherit",
};
const specialtyPill: React.CSSProperties = {
  background: "#EEEDFE", color: "#3C3489", border: "1px solid #AFA9EC",
  borderRadius: "6px", padding: "3px 10px", fontSize: "12px", fontWeight: 600,
};
const subPill: React.CSSProperties = {
  background: BG2, color: "#3d4f6b", border: BORDER,
  borderRadius: "6px", padding: "3px 10px", fontSize: "12px", fontWeight: 500,
};

export default function ProfileClient({
  email, initialName, initialTitle, initialSpecialtySlugs,
  initialIsPublic, initialEmailNotifications, articleCount, specialtyLabels,
  initialSubspecialties, initialCountry, initialCity, initialState,
  initialHospital, initialDepartment, avatarUrl, displayName,
  firstArticleDate, latestArticleDate,
}: Props) {
  const [name, setName]                     = useState(initialName);
  const [title, setTitle]                   = useState(initialTitle);
  const [specialtySlugs] = useState(initialSpecialtySlugs);
  const [subspecialties, setSubspecialties] = useState<string[]>(initialSubspecialties);
  const [editingAccount, setEditingAccount] = useState(false);
  const [editingSub, setEditingSub]         = useState(false);
  const [tempSub, setTempSub]               = useState<string[]>(initialSubspecialties);
  const [savingSub, setSavingSub]           = useState(false);
  const [accountDraft, setAccountDraft]     = useState({
    name: initialName, title: initialTitle,
    hospital: initialHospital ?? "", country: initialCountry ?? "",
    city: initialCity ?? "", state: initialState ?? "", department: initialDepartment ?? "",
  });
  const [savingAccount, setSavingAccount] = useState(false);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json() as { ok: boolean; error?: string };
    if (!data.ok) throw new Error(data.error ?? "Error");
  }

  async function saveAccount() {
    setSavingAccount(true);
    try {
      await patch({
        name: accountDraft.name || null, title: accountDraft.title || null,
        hospital: accountDraft.hospital || null, country: accountDraft.country || null,
        city: accountDraft.city || null, state: accountDraft.state || null,
        department: accountDraft.department || null,
      });
      setName(accountDraft.name);
      setTitle(accountDraft.title);
      setEditingAccount(false);
    } catch { /* ignore */ }
    setSavingAccount(false);
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

  function toggleSub(sub: string) {
    if (sub === MANDATORY_SUBSPECIALTY) return;
    setTempSub((prev) => {
      if (prev.includes(sub)) return prev.filter((s) => s !== sub);
      const elective = prev.filter((s) => s !== MANDATORY_SUBSPECIALTY);
      if (elective.length >= 3) return prev;
      return [...prev, sub];
    });
  }

  const electiveSubs = subspecialties.filter(s => s !== MANDATORY_SUBSPECIALTY);

  return (
    <>
      {/* ── Hero Card ── */}
      <div style={card}>
        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
            <ProfileAvatarUpload avatarUrl={avatarUrl} displayName={displayName} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--color-text-primary)", lineHeight: 1.2 }}>
                {name || "—"}
              </div>
              {title && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "3px" }}>{title}</div>}
              {accountDraft.hospital && (
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                  {accountDraft.hospital}{accountDraft.department ? ` · ${accountDraft.department}` : ""}
                </div>
              )}
              {/* Specialty */}
              <div style={{ marginTop: "12px" }}>
                <div style={{ fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "3px" }}>Specialty</div>
                <div style={{ fontSize: "13px", color: "var(--color-text-primary)" }}>
                  {specialtySlugs.map(slug => specialtyLabels[slug] ?? slug).join(", ") || "—"}
                </div>
              </div>
              {/* Subspecialties — exclude mandatory */}
              {electiveSubs.length > 0 && (
                <div style={{ marginTop: "8px" }}>
                  <div style={{ fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "3px" }}>Subspecialties</div>
                  <div style={{ fontSize: "13px", color: "var(--color-text-primary)" }}>
                    {electiveSubs.join(", ")}
                  </div>
                </div>
              )}
              {/* Edit subspecialties inline */}
              {editingSub && (
                <div style={{ marginTop: "14px", padding: "14px", background: BG2, borderRadius: "8px", border: BORDER }}>
                  <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", textTransform: "uppercase" as const, letterSpacing: "0.07em", fontWeight: 500, marginBottom: "10px" }}>
                    Select subspecialties (max 3)
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                    {SUBSPECIALTY_OPTIONS.filter(s => s !== MANDATORY_SUBSPECIALTY).map((sub) => {
                      const selected = tempSub.includes(sub);
                      const electiveCount = tempSub.filter(s => s !== MANDATORY_SUBSPECIALTY).length;
                      const disabled = !selected && electiveCount >= 3;
                      return (
                        <button key={sub} onClick={() => toggleSub(sub)} disabled={disabled} style={{
                          fontSize: "12px", padding: "4px 10px", borderRadius: "6px",
                          cursor: disabled ? "not-allowed" : "pointer",
                          background: selected ? "var(--color-text-primary)" : BG,
                          color: selected ? BG : disabled ? "#aaa" : "var(--color-text-secondary)",
                          border: selected ? "1px solid var(--color-text-primary)" : BORDER,
                          fontFamily: "inherit", opacity: disabled ? 0.5 : 1,
                        }}>{sub}</button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={saveSub} disabled={savingSub} style={btnPrimary}>{savingSub ? "…" : "Save"}</button>
                    <button onClick={() => { setTempSub(subspecialties); setEditingSub(false); }} style={btnSecondary}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
            {!editingSub && (
              <div style={{ display: "flex", gap: "8px", flexShrink: 0, alignSelf: "flex-start" }}>
                <button onClick={() => { setTempSub(subspecialties); setEditingSub(true); }} style={editBtn}>Edit subspecialties</button>
              </div>
            )}
          </div>
        </div>
        {/* Stats row */}
        <div style={{ borderTop: BORDER, padding: "16px 24px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
          {[
            { label: "Publications indexed", value: String(articleCount) },
            { label: "First article", value: formatDate(firstArticleDate) },
            { label: "Latest article", value: formatDate(latestArticleDate) },
          ].map((stat) => (
            <div key={stat.label} style={{ background: BG2, border: BORDER, borderRadius: "8px", padding: "12px 16px" }}>
              <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "4px", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{stat.label}</div>
              <div style={{ fontSize: "20px", fontWeight: 500, color: "var(--color-text-primary)" }}>{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Account Card ── */}
      <div style={sectionLabel}>Account</div>
      <div style={card}>
        <div style={{ position: "relative", padding: "20px 24px" }}>
          {!editingAccount && (
            <button onClick={() => setEditingAccount(true)} style={{ ...editBtn, position: "absolute", top: "16px", right: "24px" }}>Edit</button>
          )}
          {editingAccount ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 32px" }}>
                {([
                  { label: "Name", key: "name", placeholder: "" },
                  { label: "Title", key: "title", placeholder: "e.g. Dr., Prof." },
                  { label: "Hospital", key: "hospital", placeholder: "" },
                  { label: "Country", key: "country", placeholder: "" },
                  { label: "City", key: "city", placeholder: "" },
                  { label: "State / Province", key: "state", placeholder: "" },
                  { label: "Department", key: "department", placeholder: "" },
                ] as { label: string; key: string; placeholder: string }[]).map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <div style={labelStyle}>{label}</div>
                    <input value={accountDraft[key as keyof typeof accountDraft]} placeholder={placeholder} onChange={(e) => setAccountDraft((d) => ({ ...d, [key]: e.target.value }))} style={inputStyle} />
                  </div>
                ))}
                <div>
                  <div style={labelStyle}>Email</div>
                  <input value={email} readOnly style={{ ...inputStyle, opacity: 0.6, cursor: "default" }} />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
                <button onClick={() => { setAccountDraft({ name, title, hospital: initialHospital ?? "", country: initialCountry ?? "", city: initialCity ?? "", state: initialState ?? "", department: initialDepartment ?? "" }); setEditingAccount(false); }} style={btnSecondary}>Cancel</button>
                <button onClick={saveAccount} disabled={savingAccount} style={btnPrimary}>{savingAccount ? "…" : "Save"}</button>
              </div>
            </>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 32px" }}>
              {[
                { label: "Name", value: name },
                { label: "Title", value: title },
                { label: "Email", value: email },
                { label: "Hospital", value: accountDraft.hospital },
                { label: "Country", value: accountDraft.country },
                { label: "City", value: accountDraft.city },
                ...(accountDraft.state ? [{ label: "State / Province", value: accountDraft.state }] : []),
                ...(accountDraft.department ? [{ label: "Department", value: accountDraft.department }] : []),
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={labelStyle}>{label}</div>
                  <div style={valueStyle}>{value || "—"}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Privacy & Notifications Card ── */}
      <div style={sectionLabel}>Privacy &amp; Notifications</div>
      <div style={card}>
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
