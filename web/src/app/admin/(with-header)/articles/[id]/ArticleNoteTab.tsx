"use client";
import { useState } from "react";

interface Props {
  articleId:   string;
  initialNote: string;
}

export default function ArticleNoteTab({ articleId, initialNote }: Props) {
  const [note, setNote]       = useState(initialNote);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/articles/${articleId}/note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_note: note }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: "4px 0 80px" }}>
      <div style={{
        background: "#fff",
        borderRadius: "10px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)",
        marginBottom: "12px",
        overflow: "hidden",
      }}>
        <div style={{
          background: "#EEF2F7",
          borderBottom: "1px solid #dde3ed",
          padding: "10px 24px",
        }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.08em", color: "#5a6a85", textTransform: "uppercase", fontWeight: 700 }}>
            Admin Note
          </div>
        </div>
        <div style={{ padding: "20px 24px" }}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Intern note om denne artikel…"
            rows={8}
            style={{
              width: "100%", fontSize: "14px", lineHeight: 1.7,
              border: "1px solid #dde3ed", borderRadius: "8px",
              padding: "12px 14px", resize: "vertical",
              fontFamily: "inherit", color: "#1a1a1a",
              background: "#fff", outline: "none",
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "12px" }}>
            <button
              onClick={save}
              disabled={saving}
              style={{
                fontSize: "13px", fontWeight: 600, fontFamily: "inherit",
                background: saving ? "#f3f4f6" : "#1a1a1a",
                color: saving ? "#9ca3af" : "#fff",
                border: "none", borderRadius: "7px", padding: "8px 18px",
                cursor: saving ? "default" : "pointer",
              }}
            >
              {saving ? "Gemmer…" : "Gem"}
            </button>
            {saved && (
              <span style={{ fontSize: "12px", color: "#15803d" }}>✓ Gemt</span>
            )}
            {error && (
              <span style={{ fontSize: "12px", color: "#b91c1c" }}>{error}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
