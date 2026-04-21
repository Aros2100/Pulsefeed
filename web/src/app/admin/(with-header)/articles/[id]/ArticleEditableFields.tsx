"use client";

import { useState } from "react";

interface Props {
  articleId:             string;
  // Specialty
  allSpecialties:        { slug: string; label: string }[];
  articleSpecialties:    { specialty: string; specialty_match: boolean | null }[];
  // Subspecialty
  allSubspecialties:     { name: string }[];
  articleSubspecialties: string[];
  // Article type
  allArticleTypes:       { name: string }[];
  articleType:           string | null;
}

const SECTION_HEADER: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "#5a6a85",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: "8px",
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

const SAVING_LABEL: React.CSSProperties = {
  fontSize: "11px",
  color: "#9ca3af",
  fontWeight: 400,
  textTransform: "none",
  letterSpacing: 0,
};

const ERROR_BOX: React.CSSProperties = {
  fontSize: "12px",
  color: "#b91c1c",
  padding: "6px 10px",
  background: "#fef2f2",
  borderRadius: "6px",
  border: "1px solid #fecaca",
  marginTop: "6px",
};

const CHECKBOX_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "4px 0",
  fontSize: "13px",
  color: "#1a1a1a",
  cursor: "pointer",
};

export default function ArticleEditableFields({
  articleId,
  allSpecialties,
  articleSpecialties,
  allSubspecialties,
  articleSubspecialties,
  allArticleTypes,
  articleType,
}: Props) {
  // ── Specialties state ──────────────────────────────────────────────────────
  const initialSpecialtyMap = Object.fromEntries(
    articleSpecialties.map((s) => [s.specialty, s.specialty_match])
  );
  const [specialtyMap, setSpecialtyMap] = useState<Record<string, boolean | null>>(initialSpecialtyMap);
  const [savingSpecialty, setSavingSpecialty] = useState(false);
  const [specialtyError,  setSpecialtyError]  = useState<string | null>(null);

  // ── Subspecialties state ───────────────────────────────────────────────────
  const [subspecialties,    setSubspecialties]    = useState<string[]>(articleSubspecialties);
  const [savingSubspecialty, setSavingSubspecialty] = useState(false);
  const [subspecialtyError,  setSubspecialtyError]  = useState<string | null>(null);

  // ── Article type state ─────────────────────────────────────────────────────
  const [type,        setType]        = useState<string>(articleType ?? "");
  const [savingType,  setSavingType]  = useState(false);
  const [typeError,   setTypeError]   = useState<string | null>(null);

  // ── Generic PUT helper ─────────────────────────────────────────────────────
  async function put(patch: Record<string, unknown>): Promise<string | null> {
    const res  = await fetch(`/api/admin/articles/${articleId}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(patch),
    });
    const data = await res.json() as { ok: boolean; error?: string };
    return data.ok ? null : (data.error ?? "Save failed");
  }

  // ── Specialty toggle ───────────────────────────────────────────────────────
  async function toggleSpecialty(slug: string, checked: boolean) {
    const newVal = checked ? true : false;
    setSpecialtyMap((prev) => ({ ...prev, [slug]: newVal }));
    setSavingSpecialty(true);
    setSpecialtyError(null);
    try {
      const err = await put({ specialty_match: newVal ? "true" : "false", specialty: slug });
      if (err) { setSpecialtyError(err); setSpecialtyMap((prev) => ({ ...prev, [slug]: specialtyMap[slug] ?? null })); }
    } catch { setSpecialtyError("Network error"); }
    finally  { setSavingSpecialty(false); }
  }

  // ── Subspecialty toggle ────────────────────────────────────────────────────
  async function toggleSubspecialty(name: string, checked: boolean) {
    const next = checked
      ? [...subspecialties, name]
      : subspecialties.filter((s) => s !== name);
    setSubspecialties(next);
    setSavingSubspecialty(true);
    setSubspecialtyError(null);
    try {
      const err = await put({ subspecialty: next });
      if (err) { setSubspecialtyError(err); setSubspecialties(subspecialties); }
    } catch { setSubspecialtyError("Network error"); }
    finally  { setSavingSubspecialty(false); }
  }

  // ── Article type change ────────────────────────────────────────────────────
  async function changeType(value: string) {
    setType(value);
    setSavingType(true);
    setTypeError(null);
    try {
      const err = await put({ article_type: value || null });
      if (err) { setTypeError(err); setType(articleType ?? ""); }
    } catch { setTypeError("Network error"); }
    finally  { setSavingType(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Specialties */}
      <div>
        <div style={SECTION_HEADER}>
          Specialties
          {savingSpecialty && <span style={SAVING_LABEL}>Saving…</span>}
        </div>
        {allSpecialties.map(({ slug, label }) => {
          const checked = specialtyMap[slug] === true;
          return (
            <label key={slug} style={CHECKBOX_ROW}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => { void toggleSpecialty(slug, e.target.checked); }}
                style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#1d4ed8" }}
              />
              {label}
            </label>
          );
        })}
        {specialtyError && <div style={ERROR_BOX}>{specialtyError}</div>}
      </div>

      {/* Subspecialties */}
      <div>
        <div style={SECTION_HEADER}>
          Subspecialties
          {savingSubspecialty && <span style={SAVING_LABEL}>Saving…</span>}
        </div>
        {allSubspecialties.map(({ name }) => {
          const checked = subspecialties.includes(name);
          return (
            <label key={name} style={CHECKBOX_ROW}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => { void toggleSubspecialty(name, e.target.checked); }}
                style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#1d4ed8" }}
              />
              {name}
            </label>
          );
        })}
        {subspecialtyError && <div style={ERROR_BOX}>{subspecialtyError}</div>}
      </div>

      {/* Article type */}
      <div>
        <div style={SECTION_HEADER}>
          Article type
          {savingType && <span style={SAVING_LABEL}>Saving…</span>}
        </div>
        <select
          value={type}
          onChange={(e) => { void changeType(e.target.value); }}
          style={{
            fontSize: "13px",
            padding: "6px 10px",
            borderRadius: "6px",
            border: "1px solid #d1d5db",
            background: "#fff",
            color: type ? "#1a1a1a" : "#9ca3af",
            fontFamily: "inherit",
            cursor: "pointer",
            outline: "none",
            minWidth: "220px",
          }}
        >
          <option value="">— not classified —</option>
          {allArticleTypes.map(({ name }) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        {typeError && <div style={ERROR_BOX}>{typeError}</div>}
      </div>

    </div>
  );
}
