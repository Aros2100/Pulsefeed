"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  directionId: string;
  initialName: string;
  initialDescription: string;
}

export default function DirectionEditClient({ directionId, initialName, initialDescription }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name,    setName]    = useState(initialName);
  const [desc,    setDesc]    = useState(initialDescription);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        style={{ fontSize: "12px", color: "#94a3b8", background: "none", border: "1px solid #e5e7eb", borderRadius: "5px", padding: "4px 10px", cursor: "pointer" }}
      >
        Edit
      </button>
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lab/value-scoring/craft/direction/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directionId, name, description: desc }),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.error ?? "Save failed"); setBusy(false); return; }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: "12px" }}>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        style={{ width: "100%", padding: "8px 10px", fontSize: "15px", fontWeight: 600, border: "1px solid #e5e7eb", borderRadius: "6px", marginBottom: "8px", color: "#1a1a1a" }}
      />
      <textarea
        value={desc}
        onChange={e => setDesc(e.target.value)}
        placeholder="Description (optional)"
        style={{ width: "100%", minHeight: "60px", padding: "8px 10px", fontSize: "13px", border: "1px solid #e5e7eb", borderRadius: "6px", resize: "vertical", color: "#1a1a1a", marginBottom: "10px" }}
      />
      {error && <div style={{ fontSize: "12px", color: "#b91c1c", marginBottom: "8px" }}>{error}</div>}
      <div style={{ display: "flex", gap: "8px" }}>
        <button onClick={() => { setEditing(false); setName(initialName); setDesc(initialDescription); }} style={{ background: "#fff", color: "#1a1a1a", border: "1px solid #e5e7eb", borderRadius: "6px", padding: "6px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
          Cancel
        </button>
        <button onClick={save} disabled={busy || name.trim().length === 0} style={{ background: busy ? "#fda99e" : "#E83B2A", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 12px", fontSize: "12px", fontWeight: 600, cursor: busy ? "default" : "pointer" }}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
