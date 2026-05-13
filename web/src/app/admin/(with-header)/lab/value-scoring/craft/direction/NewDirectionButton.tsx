"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewDirectionButton() {
  const router = useRouter();
  const [open,  setOpen]  = useState(false);
  const [name,  setName]  = useState("");
  const [desc,  setDesc]  = useState("");
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lab/value-scoring/craft/direction/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: desc }),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.error ?? "Create failed"); setBusy(false); return; }
      router.push(`/admin/lab/value-scoring/craft/direction/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ background: "#E83B2A", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 14px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
      >
        + New direction
      </button>
    );
  }

  return (
    <div style={{ background: "#fff", border: "2px solid #E83B2A", borderRadius: "10px", padding: "20px 24px", marginTop: "20px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#E83B2A", marginBottom: "14px" }}>New direction</div>
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Direction name (e.g. Rubric-based scoring)"
        style={{ width: "100%", padding: "8px 10px", fontSize: "13px", border: "1px solid #e5e7eb", borderRadius: "6px", marginBottom: "10px", color: "#1a1a1a" }}
      />
      <textarea
        value={desc}
        onChange={e => setDesc(e.target.value)}
        placeholder="Description (optional)"
        style={{ width: "100%", minHeight: "60px", padding: "8px 10px", fontSize: "13px", border: "1px solid #e5e7eb", borderRadius: "6px", resize: "vertical", color: "#1a1a1a", marginBottom: "12px" }}
      />
      {error && <div style={{ fontSize: "12px", color: "#b91c1c", marginBottom: "10px" }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <button onClick={() => { setOpen(false); setError(null); }} style={{ background: "#fff", color: "#1a1a1a", border: "1px solid #e5e7eb", borderRadius: "6px", padding: "8px 14px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
          Cancel
        </button>
        <button
          onClick={create}
          disabled={busy || name.trim().length === 0}
          style={{ background: busy || name.trim().length === 0 ? "#fda99e" : "#E83B2A", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 14px", fontSize: "13px", fontWeight: 600, cursor: busy || name.trim().length === 0 ? "default" : "pointer" }}
        >
          {busy ? "Creating…" : "Create direction"}
        </button>
      </div>
    </div>
  );
}
