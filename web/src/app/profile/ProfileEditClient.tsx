"use client";

import { useState } from "react";
import { SPECIALTIES } from "@/lib/auth/specialties";

interface Props {
  initialName:           string;
  initialTitle:          string;
  initialSpecialtySlugs: string[];
  onNameSaved?:          (name: string) => void;
  onTitleSaved?:         (title: string) => void;
  onSpecialtiesSaved?:   (slugs: string[]) => void;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: "36px", height: "20px", borderRadius: "999px",
        border: checked ? "none" : "0.5px solid var(--color-border-tertiary)",
        cursor: "pointer",
        background: checked ? "#3B6D11" : "#c8d0dc",
        position: "relative",
        transition: "background 0.15s",
        flexShrink: 0,
        padding: 0,
      }}
    >
      <span style={{
        position: "absolute",
        top: "2px",
        left: checked ? "18px" : "2px",
        width: "16px", height: "16px", borderRadius: "50%",
        background: "#ffffff",
        transition: "left 0.15s",
      }} />
    </button>
  );
}

export { Toggle };

export default function ProfileEditClient({ initialName, initialTitle, initialSpecialtySlugs, onNameSaved, onTitleSaved, onSpecialtiesSaved }: Props) {
  const [editingName,  setEditingName]  = useState(false);
  const [name,         setName]         = useState(initialName);
  const [nameInput,    setNameInput]    = useState(initialName);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title,        setTitle]        = useState(initialTitle);
  const [titleInput,   setTitleInput]   = useState(initialTitle);
  const [editingSpec,  setEditingSpec]  = useState(false);
  const [slugs,        setSlugs]        = useState(initialSpecialtySlugs);
  const [tempSlugs,    setTempSlugs]    = useState(initialSpecialtySlugs);
  const [saving,       setSaving]       = useState<"name" | "title" | "spec" | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    const res  = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json() as { ok: boolean; error?: string };
    if (!data.ok) throw new Error(data.error ?? "Error");
  }

  async function saveName() {
    setSaving("name"); setError(null);
    try {
      await patch({ name: nameInput });
      setName(nameInput);
      setEditingName(false);
      onNameSaved?.(nameInput);
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    setSaving(null);
  }

  async function saveTitle() {
    setSaving("title"); setError(null);
    try {
      await patch({ title: titleInput });
      setTitle(titleInput);
      setEditingTitle(false);
      onTitleSaved?.(titleInput);
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    setSaving(null);
  }

  async function saveSpec() {
    setSaving("spec"); setError(null);
    try {
      await patch({ specialty_slugs: tempSlugs });
      setSlugs(tempSlugs);
      setEditingSpec(false);
      onSpecialtiesSaved?.(tempSlugs);
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    setSaving(null);
  }

  function toggleSlug(slug: string) {
    setTempSlugs((prev) => prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]);
  }

  const rowStyle: React.CSSProperties = { padding: "16px 24px", borderTop: "1px solid #f0f0f0" };
  const labelStyle: React.CSSProperties = { fontSize: "12px", color: "#888", marginBottom: "4px" };
  const valueStyle: React.CSSProperties = { fontSize: "14px", fontWeight: 600, color: "#1a1a1a" };

  return (
    <div>
      {error && (
        <div style={{ margin: "0 24px 12px", fontSize: "12px", color: "#b91c1c", padding: "8px 12px", background: "#fef2f2", borderRadius: "6px" }}>
          {error}
        </div>
      )}

      {/* Name row */}
      <div style={rowStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Name</div>
            {editingName ? (
              <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "6px" }}>
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void saveName(); if (e.key === "Escape") setEditingName(false); }}
                  style={{ fontSize: "14px", padding: "6px 10px", borderRadius: "6px", border: "1px solid #dde3ed", outline: "none", flex: 1, maxWidth: "260px" }}
                />
                <button onClick={saveName} disabled={saving === "name"} style={{ fontSize: "12px", padding: "6px 14px", borderRadius: "6px", background: "#1a1a1a", color: "#fff", border: "none", cursor: "pointer" }}>
                  {saving === "name" ? "…" : "Save"}
                </button>
                <button onClick={() => setEditingName(false)} style={{ fontSize: "12px", padding: "6px 14px", borderRadius: "6px", background: "none", color: "#5a6a85", border: "1px solid #dde3ed", cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            ) : (
              <div style={valueStyle}>{name || "—"}</div>
            )}
          </div>
          {!editingName && (
            <button onClick={() => { setNameInput(name); setEditingName(true); }} style={{ fontSize: "12px", color: "#5a6a85", background: "none", border: "1px solid #dde3ed", padding: "5px 12px", borderRadius: "6px", cursor: "pointer" }}>
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Title row */}
      <div style={rowStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Title</div>
            {editingTitle ? (
              <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "6px" }}>
                <input
                  autoFocus
                  value={titleInput}
                  placeholder="e.g. Dr., Prof., Overlæge"
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void saveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
                  style={{ fontSize: "14px", padding: "6px 10px", borderRadius: "6px", border: "1px solid #dde3ed", outline: "none", flex: 1, maxWidth: "260px" }}
                />
                <button onClick={saveTitle} disabled={saving === "title"} style={{ fontSize: "12px", padding: "6px 14px", borderRadius: "6px", background: "#1a1a1a", color: "#fff", border: "none", cursor: "pointer" }}>
                  {saving === "title" ? "…" : "Save"}
                </button>
                <button onClick={() => setEditingTitle(false)} style={{ fontSize: "12px", padding: "6px 14px", borderRadius: "6px", background: "none", color: "#5a6a85", border: "1px solid #dde3ed", cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            ) : (
              <div style={valueStyle}>{title || "—"}</div>
            )}
          </div>
          {!editingTitle && (
            <button onClick={() => { setTitleInput(title); setEditingTitle(true); }} style={{ fontSize: "12px", color: "#5a6a85", background: "none", border: "1px solid #dde3ed", padding: "5px 12px", borderRadius: "6px", cursor: "pointer" }}>
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Specialties row */}
      <div style={rowStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Specialties</div>
            {editingSpec ? (
              <div style={{ marginTop: "8px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                  {SPECIALTIES.map((s) => (
                    <button
                      key={s.slug}
                      onClick={() => toggleSlug(s.slug)}
                      style={{
                        fontSize: "12px", padding: "5px 12px", borderRadius: "6px", cursor: "pointer",
                        background:   tempSlugs.includes(s.slug) ? "#1a1a1a" : "#f5f7fa",
                        color:        tempSlugs.includes(s.slug) ? "#fff"    : "#5a6a85",
                        border:       tempSlugs.includes(s.slug) ? "1px solid #1a1a1a" : "1px solid #dde3ed",
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={saveSpec} disabled={saving === "spec"} style={{ fontSize: "12px", padding: "6px 14px", borderRadius: "6px", background: "#1a1a1a", color: "#fff", border: "none", cursor: "pointer" }}>
                    {saving === "spec" ? "…" : "Save"}
                  </button>
                  <button onClick={() => { setTempSlugs(slugs); setEditingSpec(false); }} style={{ fontSize: "12px", padding: "6px 14px", borderRadius: "6px", background: "none", color: "#5a6a85", border: "1px solid #dde3ed", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : slugs.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                {slugs.map((slug) => {
                  const label = SPECIALTIES.find((s) => s.slug === slug)?.label ?? slug;
                  return (
                    <span key={slug} style={{ background: "#EEF2F7", borderRadius: "6px", padding: "3px 10px", fontSize: "12px", fontWeight: 600, color: "#1a1a1a" }}>
                      {label}
                    </span>
                  );
                })}
              </div>
            ) : (
              <div style={{ ...valueStyle, color: "#9ca3af" }}>No specialty configured</div>
            )}
          </div>
          {!editingSpec && (
            <button onClick={() => { setTempSlugs(slugs); setEditingSpec(true); }} style={{ fontSize: "12px", color: "#5a6a85", background: "none", border: "1px solid #dde3ed", padding: "5px 12px", borderRadius: "6px", cursor: "pointer" }}>
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
