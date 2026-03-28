"use client";

import { useState } from "react";
import { SPECIALTIES } from "@/lib/auth/specialties";
import { SUBSPECIALTY_OPTIONS } from "@/lib/lab/classification-options";

const EXTRA_TAGS: { slug: string; label: string }[] = [
  { slug: "neuroscience",       label: "Neuroscience" },
  { slug: "basic_neuro_research", label: "Basic Neuro Research" },
  { slug: "anesthesiology",     label: "Anesthesiology" },
  { slug: "ent",                label: "ENT" },
];

const ALL_TAGS = [
  ...SPECIALTIES.map((s) => ({ slug: s.slug as string, label: s.label as string })),
  ...EXTRA_TAGS,
];

const TAG_LABEL: Record<string, string> = Object.fromEntries(ALL_TAGS.map((t) => [t.slug, t.label]));
function tagLabel(slug: string) { return TAG_LABEL[slug] ?? slug; }

interface Props {
  articleId:             string;
  initialTags:           string[];
  initialSpecialtyMatch: boolean | null;
  initialSpecialty:      string;
  initialSubspecialties: string[];
}

export default function ArticleEditableFields({
  articleId,
  initialTags,
  initialSpecialtyMatch,
  initialSpecialty,
  initialSubspecialties,
}: Props) {
  const [tags,           setTags]           = useState<string[]>(initialTags);
  const [subspecialties, setSubspecialties] = useState<string[]>(initialSubspecialties);
  const [specialtyMatch, setSpecialtyMatch] = useState<boolean | null>(initialSpecialtyMatch);
  const [input,          setInput]          = useState("");
  const [subInput,       setSubInput]       = useState("");
  const [saving,         setSaving]         = useState<string | null>(null);
  const [error,          setError]          = useState<string | null>(null);

  async function save(patch: { specialty_tags?: string[]; specialty_match?: string; specialty?: string; subspecialty_ai?: string[] }, key: string) {
    setSaving(key);
    setError(null);
    try {
      const res = await fetch(`/api/admin/articles/${articleId}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(patch),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) setError(data.error ?? "Fejl ved gem");
    } catch {
      setError("Netværksfejl");
    } finally {
      setSaving(null);
    }
  }

  function addTag(raw: string) {
    const slug = raw.trim().toLowerCase().replace(/\s+/g, "_");
    if (!slug || tags.includes(slug)) { setInput(""); return; }
    const newTags = [...tags, slug];
    setTags(newTags);
    setInput("");
    void save({ specialty_tags: newTags }, "tags");
  }

  function removeTag(tag: string) {
    const newTags = tags.filter((t) => t !== tag);
    setTags(newTags);
    void save({ specialty_tags: newTags }, "tags");
  }

  function addSubspecialty(raw: string) {
    const val = raw.trim();
    if (!val || subspecialties.includes(val)) { setSubInput(""); return; }
    const next = [...subspecialties, val];
    setSubspecialties(next);
    setSubInput("");
    void save({ subspecialty_ai: next }, "subspecialty");
  }

  function removeSubspecialty(val: string) {
    const next = subspecialties.filter((s) => s !== val);
    setSubspecialties(next);
    void save({ subspecialty_ai: next }, "subspecialty");
  }

  function handleSpecialtyMatchChange(val: string) {
    const parsed = val === "true" ? true : val === "false" ? false : null;
    setSpecialtyMatch(parsed);
    void save({ specialty_match: val, specialty: initialSpecialty }, "specialty_match");
  }

  const matchBg     = specialtyMatch === true ? "#f0fdf4" : specialtyMatch === false ? "#fef2f2" : "#fffbeb";
  const matchColor  = specialtyMatch === true ? "#15803d" : specialtyMatch === false ? "#b91c1c" : "#92400e";
  const matchBorder = specialtyMatch === true ? "#bbf7d0" : specialtyMatch === false ? "#fecaca" : "#fde68a";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

      {/* Specialty tags */}
      <div>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
          Specialty tags{saving === "tags" && <span style={{ color: "#9ca3af", fontWeight: 400, marginLeft: "6px" }}>gemmer…</span>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
          {tags.map((tag) => (
            <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, borderRadius: "999px", padding: "3px 6px 3px 10px", border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8" }}>
              {tagLabel(tag)}
              <button
                onClick={() => removeTag(tag)}
                title="Fjern tag"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "16px", height: "16px", borderRadius: "50%", background: "rgba(29,78,216,0.12)", border: "none", cursor: "pointer", color: "#1d4ed8", fontSize: "11px", lineHeight: 1, padding: 0, flexShrink: 0 }}
              >
                ×
              </button>
            </span>
          ))}
          {tags.length === 0 && (
            <span style={{ fontSize: "12px", color: "#9ca3af" }}>Ingen tags</span>
          )}
          <input
            list="tag-suggestions"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(input); } }}
            onBlur={() => { if (input.trim()) addTag(input); }}
            placeholder="+ tilføj tag"
            style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "999px", border: "1px dashed #bfdbfe", background: "#f8fbff", color: "#1d4ed8", outline: "none", minWidth: "110px" }}
          />
          <datalist id="tag-suggestions">
            {ALL_TAGS.filter((t) => !tags.includes(t.slug)).map((t) => (
              <option key={t.slug} value={t.slug}>{t.label}</option>
            ))}
          </datalist>
        </div>
      </div>

      {/* Subspecialer */}
      <div>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
          Subspecialer{saving === "subspecialty" && <span style={{ color: "#9ca3af", fontWeight: 400, marginLeft: "6px" }}>gemmer…</span>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
          {subspecialties.map((val) => (
            <span key={val} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, borderRadius: "999px", padding: "3px 6px 3px 10px", border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8" }}>
              {val}
              <button
                onClick={() => removeSubspecialty(val)}
                title="Fjern subspeciale"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "16px", height: "16px", borderRadius: "50%", background: "rgba(29,78,216,0.12)", border: "none", cursor: "pointer", color: "#1d4ed8", fontSize: "11px", lineHeight: 1, padding: 0, flexShrink: 0 }}
              >
                ×
              </button>
            </span>
          ))}
          {subspecialties.length === 0 && (
            <span style={{ fontSize: "12px", color: "#9ca3af" }}>Ingen subspecialer</span>
          )}
          <input
            list="subspecialty-suggestions"
            value={subInput}
            onChange={(e) => setSubInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubspecialty(subInput); } }}
            onBlur={() => { if (subInput.trim()) addSubspecialty(subInput); }}
            placeholder="+ tilføj subspeciale"
            style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "999px", border: "1px dashed #bfdbfe", background: "#f8fbff", color: "#1d4ed8", outline: "none", minWidth: "140px" }}
          />
          <datalist id="subspecialty-suggestions">
            {SUBSPECIALTY_OPTIONS.filter((o) => !subspecialties.includes(o)).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </datalist>
        </div>
      </div>

      {/* Specialty match */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Specialty match
        </span>
        <select
          value={specialtyMatch === true ? "true" : specialtyMatch === false ? "false" : "null"}
          onChange={(e) => handleSpecialtyMatchChange(e.target.value)}
          style={{ fontSize: "12px", fontWeight: 600, padding: "4px 8px", borderRadius: "6px", border: `1px solid ${matchBorder}`, background: matchBg, color: matchColor, cursor: "pointer", outline: "none" }}
        >
          <option value="null">Pending</option>
          <option value="true">Included</option>
          <option value="false">Excluded</option>
        </select>
        {saving === "specialty_match" && <span style={{ fontSize: "11px", color: "#9ca3af" }}>gemmer…</span>}
      </div>

      {error && (
        <div style={{ fontSize: "12px", color: "#b91c1c", padding: "6px 10px", background: "#fef2f2", borderRadius: "6px", border: "1px solid #fecaca" }}>
          {error}
        </div>
      )}
    </div>
  );
}
