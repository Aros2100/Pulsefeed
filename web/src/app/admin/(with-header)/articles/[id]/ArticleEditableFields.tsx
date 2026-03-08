"use client";

import { useState } from "react";
import { SPECIALTIES } from "@/lib/auth/specialties";

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
  articleId:       string;
  initialTags:     string[];
  initialStatus:   string;
}

export default function ArticleEditableFields({
  articleId,
  initialTags,
  initialStatus,
}: Props) {
  const [tags,     setTags]     = useState<string[]>(initialTags);
  const [status,   setStatus]   = useState(initialStatus);
  const [input,    setInput]    = useState("");
  const [saving,   setSaving]   = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  async function save(patch: { specialty_tags?: string[]; status?: string }, key: string) {
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

  function handleStatusChange(newStatus: string) {
    setStatus(newStatus);
    void save({ status: newStatus }, "status");
  }

  const statusBg    = status === "approved" ? "#f0fdf4" : status === "rejected" ? "#fef2f2" : "#fffbeb";
  const statusColor = status === "approved" ? "#15803d" : status === "rejected" ? "#b91c1c" : "#92400e";
  const statusBorder = status === "approved" ? "#bbf7d0" : status === "rejected" ? "#fecaca" : "#fde68a";

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

          {/* Input */}
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

      {/* Status */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "#5a6a85", textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</span>
        <select
          value={status}
          onChange={(e) => handleStatusChange(e.target.value)}
          style={{ fontSize: "12px", fontWeight: 600, padding: "4px 8px", borderRadius: "6px", border: `1px solid ${statusBorder}`, background: statusBg, color: statusColor, cursor: "pointer", outline: "none" }}
        >
          <option value="pending">pending</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
        </select>
        {saving === "status" && <span style={{ fontSize: "11px", color: "#9ca3af" }}>gemmer…</span>}
      </div>

      {error && (
        <div style={{ fontSize: "12px", color: "#b91c1c", padding: "6px 10px", background: "#fef2f2", borderRadius: "6px", border: "1px solid #fecaca" }}>
          {error}
        </div>
      )}
    </div>
  );
}
